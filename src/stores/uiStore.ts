import { create } from 'zustand';
import type { CalendarView } from '../types';

interface Toast {
  id: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface UIStore {
  calendarView: CalendarView;
  setCalendarView: (view: CalendarView) => void;
  calendarDate: Date;
  setCalendarDate: (date: Date) => void;
  selectedBookingId: string | null;
  setSelectedBookingId: (id: string | null) => void;
  bookingFormOpen: boolean;
  editingBookingId: string | null;
  openBookingForm: (editId?: string) => void;
  closeBookingForm: () => void;
  quickBookingOpen: boolean;
  setQuickBookingOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toasts: Toast[];
  addToast: (message: string, action?: Toast['action']) => void;
  removeToast: (id: string) => void;
  prefillBookingData: Partial<{ client_id: string; date: string; duration: number; type: string; estimate: number; rescheduled: boolean; timeSlot: 'morning' | 'evening'; notes: string }> | null;
  setPrefillBookingData: (data: UIStore['prefillBookingData']) => void;
  todayHandler: (() => void) | null;
  setTodayHandler: (handler: (() => void) | null) => void;
  calendarSearchOpen: boolean;
  setCalendarSearchOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  calendarView: 'month',
  setCalendarView: (view) => set({ calendarView: view }),
  calendarDate: new Date(2026, 3, 1),
  setCalendarDate: (date) => set({ calendarDate: date }),
  selectedBookingId: null,
  setSelectedBookingId: (id) => set({ selectedBookingId: id }),
  bookingFormOpen: false,
  editingBookingId: null,
  openBookingForm: (editId) =>
    set({ bookingFormOpen: true, editingBookingId: editId ?? null }),
  closeBookingForm: () =>
    set({ bookingFormOpen: false, editingBookingId: null, prefillBookingData: null }),
  quickBookingOpen: false,
  setQuickBookingOpen: (open) => set({ quickBookingOpen: open }),
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toasts: [],
  addToast: (message, action) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, action }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  prefillBookingData: null,
  setPrefillBookingData: (data) => set({ prefillBookingData: data }),
  todayHandler: null,
  setTodayHandler: (handler) => set({ todayHandler: handler }),
  calendarSearchOpen: false,
  setCalendarSearchOpen: (open) => set({ calendarSearchOpen: open }),
}));
