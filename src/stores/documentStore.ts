import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Document } from '../types';
import * as documentService from '../services/documentService';

interface DocumentStore {
  documents: Document[];
  isLoading: boolean;
  fetchDocuments: () => Promise<void>;
  getDocumentsForClient: (clientId: string) => Document[];
  getDocumentsForBooking: (bookingId: string) => Document[];
  uploadDocument: (file: File, clientId: string, bookingId?: string, forceType?: Document['type']) => Promise<Document>;
  removeDocument: (doc: Document) => Promise<void>;
}

export const useDocumentStore = create<DocumentStore>()(persist((set, get) => ({
  documents: [],
  isLoading: false,

  fetchDocuments: async () => {
    if (get().documents.length === 0) set({ isLoading: true });
    try {
      const documents = await documentService.fetchDocuments();
      set({ documents, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  getDocumentsForClient: (clientId) =>
    get().documents.filter((d) => d.client_id === clientId),

  getDocumentsForBooking: (bookingId) =>
    get().documents.filter((d) => d.booking_id === bookingId),

  uploadDocument: async (file, clientId, bookingId, forceType) => {
    const doc = await documentService.uploadDocument(file, clientId, bookingId, forceType);
    set((s) => ({ documents: [doc, ...s.documents] }));
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
  partialize: (state) => ({ documents: state.documents }),
}));
