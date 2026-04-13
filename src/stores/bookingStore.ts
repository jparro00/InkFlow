import { create } from 'zustand';
import type { Booking } from '../types';
import * as bookingService from '../services/bookingService';

interface BookingStore {
  bookings: Booking[];
  isLoading: boolean;
  error: string | null;
  fetchBookings: () => Promise<void>;
  getBooking: (id: string) => Booking | undefined;
  getBookingsForClient: (clientId: string) => Booking[];
  getBookingsForDate: (date: Date) => Booking[];
  getBookingsForMonth: (year: number, month: number) => Booking[];
  addBooking: (booking: Omit<Booking, 'id' | 'created_at'>) => Promise<Booking>;
  updateBooking: (id: string, data: Partial<Booking>) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  searchBookings: (query: string, clients: { id: string; name: string }[]) => Booking[];
}

export const useBookingStore = create<BookingStore>((set, get) => ({
  bookings: [],
  isLoading: false,
  error: null,

  fetchBookings: async () => {
    set({ isLoading: true, error: null });
    try {
      const bookings = await bookingService.fetchBookings();
      set({ bookings, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  getBooking: (id) => get().bookings.find((b) => b.id === id),

  getBookingsForClient: (clientId) =>
    get().bookings.filter((b) => b.client_id === clientId),

  getBookingsForDate: (date) => {
    const day = date.toDateString();
    return get().bookings.filter((b) => new Date(b.date).toDateString() === day);
  },

  getBookingsForMonth: (year, month) =>
    get().bookings.filter((b) => {
      const d = new Date(b.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }),

  addBooking: async (data) => {
    const tempId = crypto.randomUUID();
    const optimistic: Booking = {
      ...data,
      id: tempId,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ bookings: [...s.bookings, optimistic] }));

    try {
      const real = await bookingService.createBooking(data);
      set((s) => ({
        bookings: s.bookings.map((b) => (b.id === tempId ? real : b)),
      }));
      return real;
    } catch (e) {
      set((s) => ({ bookings: s.bookings.filter((b) => b.id !== tempId) }));
      throw e;
    }
  },

  updateBooking: async (id, data) => {
    const prev = get().bookings.find((b) => b.id === id);
    set((s) => ({
      bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...data } : b)),
    }));

    try {
      await bookingService.updateBooking(id, data);
    } catch (e) {
      if (prev) {
        set((s) => ({
          bookings: s.bookings.map((b) => (b.id === id ? prev : b)),
        }));
      }
      throw e;
    }
  },

  deleteBooking: async (id) => {
    const prev = get().bookings.find((b) => b.id === id);
    set((s) => ({ bookings: s.bookings.filter((b) => b.id !== id) }));

    try {
      await bookingService.deleteBooking(id);
    } catch (e) {
      if (prev) {
        set((s) => ({ bookings: [...s.bookings, prev] }));
      }
      throw e;
    }
  },

  searchBookings: (query, clients) => {
    const q = query.toLowerCase();
    return get().bookings.filter((b) => {
      const clientName = clients.find((c) => c.id === b.client_id)?.name ?? '';
      return (
        clientName.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q) ||
        b.notes?.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q)
      );
    });
  },
}));
