import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Booking } from '../types';
import * as bookingService from '../services/bookingService';

interface BookingStore {
  bookings: Booking[];
  isLoading: boolean;
  error: string | null;
  _fetchedAt: number | null;
  fetchBookings: (force?: boolean) => Promise<void>;
  getBooking: (id: string) => Booking | undefined;
  getBookingsForClient: (clientId: string) => Booking[];
  getBookingsForDate: (date: Date) => Booking[];
  getBookingsForMonth: (year: number, month: number) => Booking[];
  addBooking: (booking: Omit<Booking, 'id' | 'created_at'>, id?: string) => Promise<Booking>;
  updateBooking: (id: string, data: Partial<Booking>) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  searchBookings: (query: string, clients: { id: string; name: string }[]) => Booking[];
}

const FETCH_TTL = 60_000;

export const useBookingStore = create<BookingStore>()(persist((set, get) => ({
  bookings: [],
  isLoading: false,
  error: null,
  _fetchedAt: null,

  fetchBookings: async (force = false) => {
    const fetchedAt = get()._fetchedAt;
    if (!force && fetchedAt && Date.now() - fetchedAt < FETCH_TTL) return;

    if (get().bookings.length === 0) set({ isLoading: true });
    set({ error: null });
    try {
      const bookings = await bookingService.fetchBookings();
      set({ bookings, isLoading: false, _fetchedAt: Date.now() });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  getBooking: (id) => get().bookings.find((b) => b.id === id),

  getBookingsForClient: (clientId) =>
    get().bookings.filter((b) => b.client_id === clientId),

  getBookingsForDate: (date) => {
    // Overlap semantics: include multi-day events that cover this day,
    // not just those that start on it.
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    return get().bookings.filter((b) => {
      const start = new Date(b.date);
      const end = new Date(b.end_date);
      return start < dayEnd && end > dayStart;
    });
  },

  getBookingsForMonth: (year, month) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1);
    return get().bookings.filter((b) => {
      const start = new Date(b.date);
      const end = new Date(b.end_date);
      return start < monthEnd && end > monthStart;
    });
  },

  addBooking: async (data, id) => {
    const bookingId = id ?? crypto.randomUUID();
    const optimistic: Booking = {
      ...data,
      id: bookingId,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ bookings: [...s.bookings, optimistic] }));

    try {
      const real = await bookingService.createBooking(data, bookingId);
      set((s) => ({
        bookings: s.bookings.map((b) => (b.id === bookingId ? real : b)),
      }));
      return real;
    } catch (e) {
      set((s) => ({ bookings: s.bookings.filter((b) => b.id !== bookingId) }));
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
}), {
  name: 'inkbloop-bookings',
  partialize: (state) => ({ bookings: state.bookings, _fetchedAt: state._fetchedAt }),
}));
