import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Document } from '../types';
import * as documentService from '../services/documentService';
import { supabase } from '../lib/supabase';
import { saveImage } from '../lib/imageDb';
import { generateThumbnail } from '../utils/imageProcessing';
import { useUIStore } from './uiStore';

interface DocumentStore {
  documents: Document[];
  isLoading: boolean;
  _fetchedAt: number | null;
  fetchDocuments: (force?: boolean) => Promise<void>;
  getDocumentsForClient: (clientId: string) => Document[];
  getDocumentsForBooking: (bookingId: string) => Document[];
  uploadDocument: (file: File, clientId: string, bookingId?: string, forceType?: Document['type']) => Promise<Document>;
  removeDocument: (doc: Document) => Promise<void>;
}

const FETCH_TTL = 60_000;

export const useDocumentStore = create<DocumentStore>()(persist((set, get) => ({
  documents: [],
  isLoading: false,
  _fetchedAt: null,

  fetchDocuments: async (force = false) => {
    const fetchedAt = get()._fetchedAt;
    if (!force && fetchedAt && Date.now() - fetchedAt < FETCH_TTL) return;

    if (get().documents.length === 0) set({ isLoading: true });
    try {
      const documents = await documentService.fetchDocuments();
      set({ documents, isLoading: false, _fetchedAt: Date.now() });
    } catch {
      set({ isLoading: false });
    }
  },

  getDocumentsForClient: (clientId) =>
    get().documents.filter((d) => d.client_id === clientId),

  getDocumentsForBooking: (bookingId) =>
    get().documents.filter((d) => d.booking_id === bookingId),

  // Local-first mirror of useBookingImages.addImages: generate a thumbnail,
  // cache both blobs in IndexedDB (so useDocumentImageThumbnails finds the
  // thumb instantly), insert the row optimistically, and push to R2 + Supabase
  // in the background. Returns as soon as the local work is done, so the UI
  // updates within ~1 thumbnail-gen frame instead of after an R2 roundtrip.
  uploadDocument: async (file, clientId, bookingId, forceType) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const doc = documentService.prepareDocument(file, session.user.id, clientId, bookingId, forceType);

    if (file.type.startsWith('image/')) {
      try {
        const { thumbnail } = await generateThumbnail(file);
        await saveImage(doc.id, file, thumbnail);
      } catch (e) {
        console.error('[documentStore] thumbnail gen failed:', e);
      }
    }

    set((s) => ({ documents: [doc, ...s.documents] }));

    // Fire-and-forget remote sync. On failure, roll back the optimistic row
    // and surface a toast. On success, replace with the canonical server row
    // in case its created_at drifted from our client-side timestamp.
    documentService.finalizeDocument(file, doc)
      .then((serverDoc) => {
        set((s) => ({
          documents: s.documents.map((d) => (d.id === doc.id ? serverDoc : d)),
        }));
      })
      .catch((e) => {
        console.error('[documentStore] upload failed:', e);
        set((s) => ({ documents: s.documents.filter((d) => d.id !== doc.id) }));
        useUIStore.getState().addToast('Upload failed');
      });

    return doc;
  },

  removeDocument: async (doc) => {
    set((s) => ({ documents: s.documents.filter((d) => d.id !== doc.id) }));
    try {
      await documentService.deleteDocument(doc);
    } catch (e) {
      // Roll back
      set((s) => ({ documents: [doc, ...s.documents] }));
      throw e;
    }
  },
}), {
  name: 'inkbloop-documents',
  partialize: (state) => ({ documents: state.documents, _fetchedAt: state._fetchedAt }),
}));
