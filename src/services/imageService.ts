import { supabase } from '../lib/supabase';
import type { BookingImage, ImageSyncStatus, StorageBackend } from '../types';
import type { Database } from '../types/database';

type ImageRow = Database['public']['Tables']['booking_images']['Row'];
type ImageInsert = Database['public']['Tables']['booking_images']['Insert'];
type ImageUpdate = Database['public']['Tables']['booking_images']['Update'];

function toBookingImage(row: ImageRow): BookingImage {
  return {
    id: row.id,
    booking_id: row.booking_id,
    created_at: row.created_at,
    filename: row.filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    width: row.width,
    height: row.height,
    sync_status: row.sync_status as ImageSyncStatus,
    remote_path: row.remote_path ?? undefined,
    storage_backend: row.storage_backend,
  };
}

export async function fetchImages(): Promise<BookingImage[]> {
  const { data, error } = await supabase
    .from('booking_images')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toBookingImage);
}

export async function createImageMeta(
  image: Omit<BookingImage, 'created_at'>
): Promise<BookingImage> {
  const row: ImageInsert = {
    id: image.id,
    booking_id: image.booking_id,
    filename: image.filename,
    mime_type: image.mime_type,
    size_bytes: image.size_bytes,
    width: image.width,
    height: image.height,
    sync_status: image.sync_status,
    remote_path: image.remote_path ?? null,
  };

  const { data, error } = await supabase
    .from('booking_images')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return toBookingImage(data);
}

export async function deleteImageMeta(id: string): Promise<void> {
  const { error } = await supabase
    .from('booking_images')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deleteImagesForBooking(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('booking_images')
    .delete()
    .eq('booking_id', bookingId);

  if (error) throw error;
}

export async function updateImageSyncStatus(
  id: string,
  syncStatus: ImageSyncStatus,
  remotePath?: string,
  storageBackend?: StorageBackend,
): Promise<void> {
  const update: ImageUpdate = { sync_status: syncStatus };
  if (remotePath !== undefined) update.remote_path = remotePath;
  if (storageBackend !== undefined) update.storage_backend = storageBackend;

  const { error } = await supabase
    .from('booking_images')
    .update(update)
    .eq('id', id);

  if (error) throw error;
}

export async function remapBookingImages(
  oldBookingId: string,
  newBookingId: string
): Promise<void> {
  const { error } = await supabase
    .from('booking_images')
    .update({ booking_id: newBookingId } as ImageUpdate)
    .eq('booking_id', oldBookingId);

  if (error) throw error;
}
