import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import { saveImage, getThumbnail, getOriginal, deleteImage as deleteImageBlob } from '../lib/imageDb';
import { generateThumbnail } from '../utils/imageProcessing';
import { imageSyncQueue } from '../lib/imageSync';
import { supabase } from '../lib/supabase';
import type { BookingImage } from '../types';

export interface ThumbnailEntry {
  id: string;
  url: string;
  meta: BookingImage;
}

export function useBookingImages(bookingId: string | undefined) {
  const allImages = useImageStore((s) => s.images);
  const images = useMemo(
    () => bookingId ? allImages.filter((img) => img.booking_id === bookingId) : [],
    [allImages, bookingId]
  );
  const addImageMeta = useImageStore((s) => s.addImage);
  const removeImageMeta = useImageStore((s) => s.removeImage);

  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const urlsRef = useRef<string[]>([]);

  // Load thumbnails from IndexedDB when image metadata changes
  // Falls back to downloading from Supabase Storage if not available locally
  useEffect(() => {
    if (!images.length) {
      setThumbnails([]);
      return;
    }

    let cancelled = false;

    async function loadThumbnails() {
      const entries: ThumbnailEntry[] = [];
      for (const meta of images) {
        let blob = await getThumbnail(meta.id);

        // If no local blob but synced to cloud, download from Supabase Storage
        if (!blob && meta.sync_status === 'synced' && meta.remote_path) {
          try {
            const { data } = await supabase.storage
              .from('booking-images')
              .download(meta.remote_path);

            if (data && !cancelled) {
              // Regenerate thumbnail and cache locally
              const { thumbnail } = await generateThumbnail(
                new File([data], meta.filename, { type: meta.mime_type })
              );
              await saveImage(meta.id, data, thumbnail);
              blob = thumbnail;
            }
          } catch (e) {
            console.error(`[useBookingImages] Failed to download ${meta.id}:`, e);
          }
        }

        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob);
          urlsRef.current.push(url);
          entries.push({ id: meta.id, url, meta });
        }
      }
      if (!cancelled) setThumbnails(entries);
    }

    loadThumbnails();

    return () => {
      cancelled = true;
    };
  }, [images]);

  // Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, []);

  const addImages = useCallback(async (files: FileList) => {
    if (!bookingId) return;
    setIsLoading(true);

    const newEntries: ThumbnailEntry[] = [];

    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      const { thumbnail, width, height } = await generateThumbnail(file);

      // Save to IndexedDB immediately (local-first)
      await saveImage(id, file, thumbnail);

      const meta = addImageMeta({
        id,
        booking_id: bookingId,
        filename: file.name,
        mime_type: file.type || 'image/jpeg',
        size_bytes: file.size,
        width,
        height,
        sync_status: 'local',
      });

      // Enqueue background upload to Supabase Storage
      imageSyncQueue.enqueue({
        imageId: id,
        bookingId,
        filename: file.name,
        mimeType: file.type || 'image/jpeg',
      });

      const url = URL.createObjectURL(thumbnail);
      urlsRef.current.push(url);
      newEntries.push({ id: meta.id, url, meta });
    }

    setThumbnails((prev) => [...prev, ...newEntries]);
    setIsLoading(false);
  }, [bookingId, addImageMeta]);

  const removeImage = useCallback(async (id: string) => {
    removeImageMeta(id);
    await deleteImageBlob(id);
    setThumbnails((prev) => {
      const entry = prev.find((t) => t.id === id);
      if (entry) URL.revokeObjectURL(entry.url);
      return prev.filter((t) => t.id !== id);
    });
  }, [removeImageMeta]);

  const getOriginalUrl = useCallback(async (id: string): Promise<string | null> => {
    // Try local first
    let blob = await getOriginal(id);

    // Fall back to cloud
    if (!blob) {
      const meta = images.find((img) => img.id === id);
      if (meta?.sync_status === 'synced' && meta.remote_path) {
        try {
          const { data } = await supabase.storage
            .from('booking-images')
            .download(meta.remote_path);
          if (data) blob = data;
        } catch (e) {
          console.error(`[useBookingImages] Failed to download original ${id}:`, e);
        }
      }
    }

    if (!blob) return null;
    return URL.createObjectURL(blob);
  }, [images]);

  return { thumbnails, isLoading, addImages, removeImage, getOriginalUrl };
}
