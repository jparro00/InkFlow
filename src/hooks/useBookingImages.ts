import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import { saveImage, getThumbnail, getOriginal, deleteImage as deleteImageBlob } from '../lib/imageDb';
import { generateThumbnail } from '../utils/imageProcessing';
import { imageSyncQueue } from '../lib/imageSync';
import { fetchR2Blob } from '../lib/r2';
import type { BookingImage, Document } from '../types';

// Download a cloud-backed blob for a booking image. R2 is the only backend.
async function downloadBookingImage(meta: BookingImage): Promise<Blob | null> {
  if (!meta.remote_path) return null;
  return fetchR2Blob(`booking-images/${meta.remote_path}`);
}

export interface ThumbnailEntry {
  id: string;
  url: string;
  filename: string;
}

// Load thumbnails + originals for an arbitrary set of BookingImage rows.
// Tries IndexedDB first, falls back to the cloud (R2 or Supabase Storage) and
// caches the downloaded blobs back into IDB. Skips rows that are still local
// on a different device (sync_status !== 'synced' and no local blob).
export function useImageThumbnails(images: BookingImage[]) {
  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([]);
  const urlsRef = useRef<string[]>([]);

  // Stable key so the effect only re-runs when the image set actually changes.
  const key = useMemo(
    () => images.map((i) => `${i.id}:${i.sync_status}:${i.remote_path ?? ''}`).join(','),
    [images]
  );

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

        // If no local blob but synced to cloud, download from R2 or Supabase
        // Storage depending on meta.storage_backend.
        if (!blob && meta.sync_status === 'synced' && meta.remote_path) {
          try {
            const data = await downloadBookingImage(meta);

            if (data && !cancelled) {
              const { thumbnail } = await generateThumbnail(
                new File([data], meta.filename, { type: meta.mime_type })
              );
              await saveImage(meta.id, data, thumbnail);
              blob = thumbnail;
            }
          } catch (e) {
            console.error(`[useImageThumbnails] Failed to download ${meta.id}:`, e);
          }
        }

        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob);
          urlsRef.current.push(url);
          entries.push({ id: meta.id, url, filename: meta.filename });
        }
      }
      if (!cancelled) setThumbnails(entries);
    }

    loadThumbnails();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, []);

  const getOriginalUrl = useCallback(async (id: string): Promise<string | null> => {
    // Try local first
    let blob = await getOriginal(id);

    // Fall back to cloud
    if (!blob) {
      const meta = images.find((img) => img.id === id);
      if (meta?.sync_status === 'synced' && meta.remote_path) {
        try {
          const data = await downloadBookingImage(meta);
          if (data) blob = data;
        } catch (e) {
          console.error(`[useImageThumbnails] Failed to download original ${id}:`, e);
        }
      }
    }

    if (!blob) return null;
    return URL.createObjectURL(blob);
  }, [images]);

  return { thumbnails, getOriginalUrl };
}

// Load thumbnails + originals for Document rows of type 'image'. Same IDB-first
// pattern as useImageThumbnails, but the blob lives at documents/<storage_path>
// in R2. Documents never go through the upload queue — they upload directly in
// documentService — so there's no sync_status to gate on.
export function useDocumentImageThumbnails(docs: Document[]) {
  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([]);
  const urlsRef = useRef<string[]>([]);

  const key = useMemo(
    () => docs.map((d) => `${d.id}:${d.storage_path}`).join(','),
    [docs]
  );

  useEffect(() => {
    if (!docs.length) {
      setThumbnails([]);
      return;
    }

    let cancelled = false;

    async function loadThumbnails() {
      const entries: ThumbnailEntry[] = [];
      for (const doc of docs) {
        let blob = await getThumbnail(doc.id);

        if (!blob) {
          try {
            const data = await fetchR2Blob(`documents/${doc.storage_path}`);
            if (data && !cancelled) {
              const { thumbnail } = await generateThumbnail(
                new File([data], doc.label ?? 'photo', { type: doc.mime_type ?? 'image/jpeg' })
              );
              await saveImage(doc.id, data, thumbnail);
              blob = thumbnail;
            }
          } catch (e) {
            console.error(`[useDocumentImageThumbnails] Failed to download ${doc.id}:`, e);
          }
        }

        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob);
          urlsRef.current.push(url);
          entries.push({ id: doc.id, url, filename: doc.label ?? 'photo' });
        }
      }
      if (!cancelled) setThumbnails(entries);
    }

    loadThumbnails();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, []);

  const getOriginalUrl = useCallback(async (id: string): Promise<string | null> => {
    let blob = await getOriginal(id);
    if (!blob) {
      const doc = docs.find((d) => d.id === id);
      if (doc) {
        try {
          const data = await fetchR2Blob(`documents/${doc.storage_path}`);
          if (data) blob = data;
        } catch (e) {
          console.error(`[useDocumentImageThumbnails] Failed to download original ${id}:`, e);
        }
      }
    }
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }, [docs]);

  return { thumbnails, getOriginalUrl };
}

export function useBookingImages(bookingId: string | undefined) {
  const allImages = useImageStore((s) => s.images);
  const images = useMemo(
    () => bookingId ? allImages.filter((img) => img.booking_id === bookingId) : [],
    [allImages, bookingId]
  );
  const addImageMeta = useImageStore((s) => s.addImage);
  const removeImageMeta = useImageStore((s) => s.removeImage);

  const { thumbnails, getOriginalUrl } = useImageThumbnails(images);
  const [isLoading, setIsLoading] = useState(false);
  const urlsRef = useRef<string[]>([]);
  const [extraThumbs, setExtraThumbs] = useState<ThumbnailEntry[]>([]);

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
      newEntries.push({ id: meta.id, url, filename: meta.filename });
    }

    // Merge optimistic thumbnails so the drawer shows them before the store
    // re-renders through useImageThumbnails. Duplicates are filtered out by id.
    setExtraThumbs((prev) => [...prev, ...newEntries]);
    setIsLoading(false);
  }, [bookingId, addImageMeta]);

  // Merged view. Optimistic extras accumulate until unmount (revoked via
  // urlsRef cleanup) — the useMemo filter keeps duplicates out of the render
  // once store-driven thumbnails cover them.
  const mergedThumbnails = useMemo(() => {
    if (extraThumbs.length === 0) return thumbnails;
    const ids = new Set(thumbnails.map((t) => t.id));
    return [...thumbnails, ...extraThumbs.filter((t) => !ids.has(t.id))];
  }, [thumbnails, extraThumbs]);

  // Revoke any optimistic object URLs on unmount.
  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, []);

  const removeImage = useCallback(async (id: string) => {
    removeImageMeta(id);
    await deleteImageBlob(id);
    setExtraThumbs((prev) => {
      const entry = prev.find((t) => t.id === id);
      if (entry) URL.revokeObjectURL(entry.url);
      return prev.filter((t) => t.id !== id);
    });
  }, [removeImageMeta]);

  return { thumbnails: mergedThumbnails, isLoading, addImages, removeImage, getOriginalUrl };
}
