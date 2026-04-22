import { supabase } from './supabase';
import { getOriginal } from './imageDb';
import { uploadToR2 } from './r2';
import { useImageStore } from '../stores/imageStore';
import type { BookingImage } from '../types';

interface SyncQueueItem {
  imageId: string;
  bookingId: string;
  filename: string;
  mimeType: string;
  retryCount: number;
}

class ImageSyncQueue {
  private queue: SyncQueueItem[] = [];
  private processing = false;
  private maxRetries = 3;

  enqueue(item: Omit<SyncQueueItem, 'retryCount'>) {
    this.queue.push({ ...item, retryCount: 0 });
    this.processNext();
  }

  get pendingCount() {
    return this.queue.length;
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue[0];
    const store = useImageStore.getState();

    try {
      store.updateSyncStatus(item.imageId, 'uploading');

      const blob = await getOriginal(item.imageId);
      if (!blob) throw new Error('Image blob not found in IndexedDB');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const ext = item.mimeType.split('/')[1] || 'jpg';
      const path = `${session.user.id}/${item.bookingId}/${item.imageId}.${ext}`;

      // R2 is the only backend. Throws on failure → caught below for retry.
      await uploadToR2(`booking-images/${path}`, blob, item.mimeType);

      store.updateSyncStatus(item.imageId, 'synced', path, 'r2');

      this.queue.shift();
    } catch (e) {
      console.error(`[ImageSync] Failed to sync ${item.imageId}:`, e);

      item.retryCount++;
      if (item.retryCount >= this.maxRetries) {
        store.updateSyncStatus(item.imageId, 'error');
        this.queue.shift();
      }
    }

    this.processing = false;

    if (this.queue.length > 0) {
      setTimeout(() => this.processNext(), 1000);
    }
  }
}

export const imageSyncQueue = new ImageSyncQueue();

// Re-enqueue any image whose blob still lives in IndexedDB but hasn't reached
// R2 yet (status 'local' / 'uploading' / 'error'). Covers the case where the
// browser was closed mid-upload.
//
// Rows whose blob isn't present locally are skipped — we can't re-upload what
// we don't have.
export async function resumePendingImageUploads(): Promise<void> {
  const images = useImageStore.getState().images;
  const candidates = images.filter(
    (img: BookingImage) =>
      img.sync_status === 'local' ||
      img.sync_status === 'uploading' ||
      img.sync_status === 'error'
  );

  for (const img of candidates) {
    const blob = await getOriginal(img.id);
    if (!blob) continue;
    imageSyncQueue.enqueue({
      imageId: img.id,
      bookingId: img.booking_id,
      filename: img.filename,
      mimeType: img.mime_type || 'image/jpeg',
    });
  }
}
