import { supabase } from './supabase';
import { getOriginal } from './imageDb';
import { useImageStore } from '../stores/imageStore';

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

      const { error: uploadError } = await supabase.storage
        .from('booking-images')
        .upload(path, blob, {
          contentType: item.mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Update sync status in store (which also persists to Supabase)
      store.updateSyncStatus(item.imageId, 'synced', path);

      this.queue.shift(); // Remove completed item
    } catch (e) {
      console.error(`[ImageSync] Failed to sync ${item.imageId}:`, e);

      item.retryCount++;
      if (item.retryCount >= this.maxRetries) {
        store.updateSyncStatus(item.imageId, 'error');
        this.queue.shift(); // Give up after max retries
      }
      // else: leave in queue for retry
    }

    this.processing = false;

    // Process next item after a brief delay (battery/network friendliness)
    if (this.queue.length > 0) {
      setTimeout(() => this.processNext(), 1000);
    }
  }
}

export const imageSyncQueue = new ImageSyncQueue();
