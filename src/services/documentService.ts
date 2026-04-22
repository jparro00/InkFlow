import { supabase } from '../lib/supabase';
import { fetchR2Blob, uploadToR2 } from '../lib/r2';
import type { Document } from '../types';
import type { Database } from '../types/database';

type DocRow = Database['public']['Tables']['documents']['Row'];

function toDocument(row: DocRow): Document {
  return {
    id: row.id,
    created_at: row.created_at,
    client_id: row.client_id,
    booking_id: row.booking_id ?? undefined,
    type: row.type as Document['type'],
    label: row.label ?? undefined,
    storage_path: row.storage_path,
    is_sensitive: row.is_sensitive,
    mime_type: row.mime_type ?? undefined,
    size_bytes: row.size_bytes ?? undefined,
    notes: row.notes ?? undefined,
    storage_backend: row.storage_backend,
  };
}

export async function fetchDocuments(): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toDocument);
}

export async function fetchDocumentsForClient(clientId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toDocument);
}

// Build a Document row client-side with a pre-computed id + storage_path.
// No network. Callers can add this to their store optimistically, then call
// finalizeDocument in the background to push the blob to R2 and persist the
// row. forceType lets callers override the auto-detected type — used by the
// booking-drawer + client-docs-tab uploads, which always land in Docs
// regardless of the file being an image.
export function prepareDocument(
  file: File,
  userId: string,
  clientId: string,
  bookingId?: string,
  forceType?: Document['type'],
): Document {
  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${userId}/${clientId}/${id}.${ext}`;
  const isImage = file.type.startsWith('image/');
  const docType: Document['type'] = forceType ?? (isImage ? 'image' : 'other');

  return {
    id,
    created_at: new Date().toISOString(),
    client_id: clientId,
    booking_id: bookingId,
    type: docType,
    label: file.name,
    storage_path: storagePath,
    is_sensitive: false,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    storage_backend: 'r2',
  };
}

// Push the blob to R2, then insert the row in documents. Throws on failure so
// the store can roll the optimistic insert back.
export async function finalizeDocument(file: File, doc: Document): Promise<Document> {
  await uploadToR2(
    `documents/${doc.storage_path}`,
    file,
    doc.mime_type || 'application/octet-stream',
  );

  const { data, error } = await supabase
    .from('documents')
    .insert({
      id: doc.id,
      client_id: doc.client_id,
      booking_id: doc.booking_id ?? null,
      type: doc.type,
      label: doc.label ?? null,
      storage_path: doc.storage_path,
      is_sensitive: doc.is_sensitive,
      mime_type: doc.mime_type ?? null,
      size_bytes: doc.size_bytes ?? null,
      storage_backend: doc.storage_backend ?? 'r2',
    })
    .select()
    .single();

  if (error) throw error;
  return toDocument(data);
}

export async function deleteDocument(doc: Document): Promise<void> {
  // R2 blobs are kept (no delete endpoint on the Worker) — rely on bucket
  // lifecycle policies for eventual cleanup. Only the metadata row is removed.
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', doc.id);

  if (error) throw error;
}

// Resolve a Document to a URL for window.open / <a href>. Reads the blob from
// R2 via the Worker (bearer auth) and returns an Object URL. The Object URL
// is live for the lifetime of the current page — callers don't need to
// revoke it since window.open / anchor navigation hands ownership to the
// target context.
export async function getSignedUrl(doc: Document): Promise<string> {
  const blob = await fetchR2Blob(`documents/${doc.storage_path}`);
  if (!blob) throw new Error(`document blob not found: ${doc.storage_path}`);
  return URL.createObjectURL(blob);
}
