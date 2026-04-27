import { create } from 'zustand';
import type { ReactNode } from 'react';
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
  prefillBookingData: Partial<{ client_id: string; date: string; end_date: string; duration: number; is_all_day: boolean; blocks_availability: boolean; type: string; estimate: number; rescheduled: boolean; timeSlot: 'morning' | 'evening'; notes: string; title: string }> | null;
  setPrefillBookingData: (data: UIStore['prefillBookingData']) => void;
  todayHandler: (() => void) | null;
  setTodayHandler: (handler: (() => void) | null) => void;
  scrollToCurrentMonth: (() => void) | null;
  setScrollToCurrentMonth: (handler: (() => void) | null) => void;
  calendarSearchOpen: boolean;
  setCalendarSearchOpen: (open: boolean) => void;
  headerLeft: ReactNode;
  headerRight: ReactNode;
  setHeaderLeft: (node: ReactNode) => void;
  setHeaderRight: (node: ReactNode) => void;
  createClientFormOpen: boolean;
  setCreateClientFormOpen: (open: boolean) => void;
  prefillClientData: { name?: string; phone?: string } | null;
  setPrefillClientData: (data: { name?: string; phone?: string } | null) => void;
  editingClientId: string | null;
  setEditingClientId: (id: string | null) => void;
  changedBookingFields: Set<string>;
  setChangedBookingFields: (fields: Set<string>) => void;
  changedClientFields: Set<string>;
  setChangedClientFields: (fields: Set<string>) => void;
  pendingClientChanges: Partial<{ name: string; phone: string; tags: string[]; dob: string }> | null;
  setPendingClientChanges: (changes: UIStore['pendingClientChanges']) => void;
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  modalCollapsed: boolean;
  setModalCollapsed: (collapsed: boolean) => void;
  blockedOpenTrigger: number;
  // True while a page-level confirm dialog (e.g. "Delete client?") is open.
  // The FAB hides in this state so it doesn't obscure the confirm button.
  confirmDialogOpen: boolean;
  setConfirmDialogOpen: (open: boolean) => void;
  // Set by the feedback agent so the Feedback tab opens with the user's
  // dictated text pre-populated for review.
  prefillFeedbackText: string | null;
  setPrefillFeedbackText: (text: string | null) => void;
  // When set, BookingForm.handleSave will attach the newly-created booking
  // to this consent submission (status submitted → approved_pending) and
  // clear the field. Used by the consent-form approval flow's "Create new
  // booking" affordance — the consent UI hands off to BookingForm and lets
  // BookingForm complete the round-trip on save.
  pendingConsentSubmissionId: string | null;
  setPendingConsentSubmissionId: (id: string | null) => void;
  // The currently-open consent submission in the artist's review drawer.
  // Mirrors the selectedBookingId / selectedConversationId pattern so the
  // drawer can render at the AppShell root (where z-index works against the
  // tab bar and FAB) rather than inside the Forms page.
  selectedConsentSubmissionId: string | null;
  setSelectedConsentSubmissionId: (id: string | null) => void;
  // Submission whose "Attach to booking" picker is open. Tapping Approve in
  // the consent drawer closes the drawer and opens the picker at the AppShell
  // level — that lets the picker collapse-to-header (drag down) without the
  // consent drawer hovering behind it. Dismissing the picker does NOT mutate
  // the submission; the form stays in 'submitted' until the user actually
  // picks (or creates) a booking.
  attachToBookingSubmissionId: string | null;
  setAttachToBookingSubmissionId: (id: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  calendarView: 'month',
  setCalendarView: (view) => set({ calendarView: view }),
  calendarDate: new Date(),
  setCalendarDate: (date) => set({ calendarDate: date }),
  selectedBookingId: null,
  setSelectedBookingId: (id) => {
    if (id && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ selectedBookingId: id });
  },
  bookingFormOpen: false,
  editingBookingId: null,
  openBookingForm: (editId) => {
    if (useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ bookingFormOpen: true, editingBookingId: editId ?? null });
  },
  closeBookingForm: () =>
    set({ bookingFormOpen: false, editingBookingId: null, prefillBookingData: null, changedBookingFields: new Set() }),
  quickBookingOpen: false,
  setQuickBookingOpen: (open) => {
    if (open && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ quickBookingOpen: open });
  },
  searchOpen: false,
  setSearchOpen: (open) => {
    if (open && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ searchOpen: open });
  },
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
  scrollToCurrentMonth: null,
  setScrollToCurrentMonth: (handler) => set({ scrollToCurrentMonth: handler }),
  calendarSearchOpen: false,
  setCalendarSearchOpen: (open) => set({ calendarSearchOpen: open }),
  headerLeft: null,
  headerRight: null,
  setHeaderLeft: (node) => set({ headerLeft: node }),
  setHeaderRight: (node) => set({ headerRight: node }),
  createClientFormOpen: false,
  setCreateClientFormOpen: (open) => {
    if (open && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ createClientFormOpen: open });
  },
  prefillClientData: null,
  setPrefillClientData: (data) => set({ prefillClientData: data }),
  editingClientId: null,
  changedBookingFields: new Set<string>(),
  setChangedBookingFields: (fields) => set({ changedBookingFields: fields }),
  changedClientFields: new Set<string>(),
  setChangedClientFields: (fields) => set({ changedClientFields: fields }),
  pendingClientChanges: null,
  setPendingClientChanges: (changes) => set({ pendingClientChanges: changes }),
  setEditingClientId: (id) => {
    if (id && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    // Clear agent data when closing
    if (!id) {
      set({ editingClientId: null, pendingClientChanges: null, changedClientFields: new Set() });
    } else {
      set({ editingClientId: id });
    }
  },
  selectedConversationId: null,
  setSelectedConversationId: (id) => {
    if (id && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ selectedConversationId: id });
  },
  modalCollapsed: false,
  setModalCollapsed: (collapsed) => set({ modalCollapsed: collapsed }),
  blockedOpenTrigger: 0,
  confirmDialogOpen: false,
  setConfirmDialogOpen: (open) => set({ confirmDialogOpen: open }),
  prefillFeedbackText: null,
  setPrefillFeedbackText: (text) => set({ prefillFeedbackText: text }),
  pendingConsentSubmissionId: null,
  setPendingConsentSubmissionId: (id) => set({ pendingConsentSubmissionId: id }),
  selectedConsentSubmissionId: null,
  setSelectedConsentSubmissionId: (id) => {
    if (id && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ selectedConsentSubmissionId: id });
  },
  attachToBookingSubmissionId: null,
  setAttachToBookingSubmissionId: (id) => {
    if (id && useUIStore.getState().modalCollapsed) {
      set((s) => ({ blockedOpenTrigger: s.blockedOpenTrigger + 1 }));
      return;
    }
    set({ attachToBookingSubmissionId: id });
  },
}));
