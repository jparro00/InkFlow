import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookingImage, ImageSyncStatus, StorageBackend } from '../types';
import * as imageService from '../services/imageService';

interface ImageStore {
  images: BookingImage[];
  isLoading: boolean;
  fetchImages: () => Promise<void>;
  getImagesForBooking: (bookingId: string) => BookingImage[];
  addImage: (data: Omit<BookingImage, 'created_at'>) => BookingImage;
  addImageAsync: (data: Omit<BookingImage, 'created_at'>) => Promise<BookingImage>;
  removeImage: (id: string) => void;
  removeImageAsync: (id: string) => Promise<void>;
  removeImagesForBooking: (bookingId: string) => void;
  removeImagesForBookingAsync: (bookingId: string) => Promise<void>;
  remapBookingImages: (oldBookingId: string, newBookingId: string) => void;
  remapBookingImagesAsync: (oldBookingId: string, newBookingId: string) => Promise<void>;
  updateSyncStatus: (
    id: string,
    status: ImageSyncStatus,
    remotePath?: string,
    storageBackend?: StorageBackend,
  ) => void;
}

export const useImageStore = create<ImageStore>()(persist((set, get) => ({
  images: [],
  isLoading: false,

  fetchImages: async () => {
    if (get().images.length === 0) set({ isLoading: true });
    try {
      const images = await imageService.fetchImages();
      set({ images, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  getImagesForBooking: (bookingId) =>
    get().images.filter((img) => img.booking_id === bookingId),

  // Synchronous optimistic add (for instant UI), background persists via addImageAsync
  addImage: (data) => {
    const image: BookingImage = {
      ...data,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ images: [...s.images, image] }));

    // Fire-and-forget persist to Supabase
    imageService.createImageMeta(data).catch(console.error);

    return image;
  },

  addImageAsync: async (data) => {
    const image: BookingImage = {
      ...data,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ images: [...s.images, image] }));

    try {
      const real = await imageService.createImageMeta(data);
      set((s) => ({
        images: s.images.map((img) => (img.id === data.id ? real : img)),
      }));
      return real;
    } catch (e) {
      set((s) => ({ images: s.images.filter((img) => img.id !== data.id) }));
      throw e;
    }
  },

  removeImage: (id) => {
    set((s) => ({ images: s.images.filter((img) => img.id !== id) }));
    imageService.deleteImageMeta(id).catch(console.error);
  },

  removeImageAsync: async (id) => {
    const prev = get().images.find((img) => img.id === id);
    set((s) => ({ images: s.images.filter((img) => img.id !== id) }));

    try {
      await imageService.deleteImageMeta(id);
    } catch (e) {
      if (prev) set((s) => ({ images: [...s.images, prev] }));
      throw e;
    }
  },

  removeImagesForBooking: (bookingId) => {
    set((s) => ({ images: s.images.filter((img) => img.booking_id !== bookingId) }));
    imageService.deleteImagesForBooking(bookingId).catch(console.error);
  },

  removeImagesForBookingAsync: async (bookingId) => {
    const removed = get().images.filter((img) => img.booking_id === bookingId);
    set((s) => ({ images: s.images.filter((img) => img.booking_id !== bookingId) }));

    try {
      await imageService.deleteImagesForBooking(bookingId);
    } catch (e) {
      set((s) => ({ images: [...s.images, ...removed] }));
      throw e;
    }
  },

  remapBookingImages: (oldBookingId, newBookingId) => {
    set((s) => ({
      images: s.images.map((img) =>
        img.booking_id === oldBookingId ? { ...img, booking_id: newBookingId } : img
      ),
    }));
    imageService.remapBookingImages(oldBookingId, newBookingId).catch(console.error);
  },

  remapBookingImagesAsync: async (oldBookingId, newBookingId) => {
    set((s) => ({
      images: s.images.map((img) =>
        img.booking_id === oldBookingId ? { ...img, booking_id: newBookingId } : img
      ),
    }));

    try {
      await imageService.remapBookingImages(oldBookingId, newBookingId);
    } catch (e) {
      // Roll back
      set((s) => ({
        images: s.images.map((img) =>
          img.booking_id === newBookingId ? { ...img, booking_id: oldBookingId } : img
        ),
      }));
      throw e;
    }
  },

  updateSyncStatus: (id, status, remotePath, storageBackend) => {
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id
          ? {
              ...img,
              sync_status: status,
              remote_path: remotePath ?? img.remote_path,
              storage_backend: storageBackend ?? img.storage_backend,
            }
          : img
      ),
    }));
    imageService
      .updateImageSyncStatus(id, status, remotePath, storageBackend)
      .catch(console.error);
  },
}), {
  name: 'inkbloop-images',
  partialize: (state) => ({ images: state.images }),
}));
