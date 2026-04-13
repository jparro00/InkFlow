import { supabase } from '../lib/supabase';
import type { BookingImage, ImageSyncStatus } from '../types';

function toBookingImage(row: Record<string, unknown>): BookingImage {
  return {
    id: row.id as string,
    booking_id: row.booking_id as string,
    created_at: row.created_at as string,
    filename: row.filename as string,
    mime_type: row.mime_type as string,
    size_bytes: row.size_bytes as number,
    width: row.width as number,
    height: row.height as number,
    sync_status: row.sync_status as ImageSyncStatus,
    remote_path: (row.remote_path as string) ?? undefined,
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
  const { data, error } = await supabase
    .from('booking_images')
    .insert({
      id: image.id,
      booking_id: image.booking_id,
      filename: image.filename,
      mime_type: image.mime_type,
      size_bytes: image.size_bytes,
      width: image.width,
      height: image.height,
      sync_status: image.sync_status,
      remote_path: image.remote_path ?? null,
    })
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
  remotePath?: string
): Promise<void> {
  const update: Record<string, unknown> = { sync_status: syncStatus };
  if (remotePath !== undefined) update.remote_path = remotePath;

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
    .update({ booking_id: newBookingId })
    .eq('booking_id', oldBookingId);

  if (error) throw error;
}
