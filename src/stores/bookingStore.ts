import { create } from 'zustand';
import type { Booking } from '../types';
import { mockBookings } from '../data/mockData';

interface BookingStore {
  bookings: Booking[];
  getBooking: (id: string) => Booking | undefined;
  getBookingsForClient: (clientId: string) => Booking[];
  getBookingsForDate: (date: Date) => Booking[];
  getBookingsForMonth: (year: number, month: number) => Booking[];
  addBooking: (booking: Omit<Booking, 'id' | 'created_at'>) => Booking;
  updateBooking: (id: string, data: Partial<Booking>) => void;
  deleteBooking: (id: string) => void;
  searchBookings: (query: string, clients: { id: string; name: string }[]) => Booking[];
}

export const useBookingStore = create<BookingStore>((set, get) => ({
  bookings: mockBookings,

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

  addBooking: (data) => {
    const booking: Booking = {
      ...data,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    set((s) => ({ bookings: [...s.bookings, booking] }));
    return booking;
  },

  updateBooking: (id, data) => {
    set((s) => ({
      bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...data } : b)),
    }));
  },

  deleteBooking: (id) => {
    set((s) => ({ bookings: s.bookings.filter((b) => b.id !== id) }));
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
