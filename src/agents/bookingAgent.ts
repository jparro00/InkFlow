import { useUIStore } from '../stores/uiStore';
import { useAgentStore } from '../stores/agentStore';
import { useBookingStore } from '../stores/bookingStore';
import { useClientStore } from '../stores/clientStore';
import { useImageStore } from '../stores/imageStore';
import { deleteImage as deleteImageBlob } from '../lib/imageDb';
import type { ResolvedBookingCreate, ResolvedBookingOpen, ResolvedBookingEdit, ResolvedBookingDelete } from './types';

/**
 * Booking Agent — pure executor.
 * Receives fully resolved entities from the orchestrator. Never does disambiguation.
 */

export function executeBookingCreate(data: ResolvedBookingCreate) {
  const store = useAgentStore.getState();
  const ui = useUIStore.getState();

  // Build prefill data (same shape BookingForm expects)
  const prefill: Record<string, unknown> = {};
  if (data.client_id) prefill.client_id = data.client_id;
  if (data.date) prefill.date = data.date;
  if (data.end_date) prefill.end_date = data.end_date;
  if (data.duration) prefill.duration = data.duration;
  if (data.type) prefill.type = data.type;
  if (data.timeSlot) prefill.timeSlot = data.timeSlot;
  if (data.estimate) prefill.estimate = data.estimate;
  if (data.notes) prefill.notes = data.notes;
  if (data.rescheduled) prefill.rescheduled = data.rescheduled;
  if (data.title) prefill.title = data.title;
  if (data.is_all_day !== undefined) prefill.is_all_day = data.is_all_day;
  if (data.blocks_availability !== undefined) prefill.blocks_availability = data.blocks_availability;

  // Show action confirmation in panel, then open form
  store.replaceLastLoading({
    status: 'action_taken',
    actionLabel: 'Opening booking form...',
  });

  // Set prefill and open form
  ui.setPrefillBookingData(prefill as Parameters<typeof ui.setPrefillBookingData>[0]);

  // Close panel, then open form (small delay so the panel dismisses first)
  setTimeout(() => {
    store.closePanel();
    ui.openBookingForm();
  }, 300);
}

export function executeBookingOpen(data: ResolvedBookingOpen) {
  const store = useAgentStore.getState();
  const ui = useUIStore.getState();

  store.replaceLastLoading({
    status: 'action_taken',
    actionLabel: 'Opening booking...',
  });

  setTimeout(() => {
    store.closePanel();
    ui.setSelectedBookingId(data.booking_id);
  }, 300);
}

export async function executeBookingDelete(data: ResolvedBookingDelete) {
  const store = useAgentStore.getState();
  const ui = useUIStore.getState();
  const bookingStore = useBookingStore.getState();
  const clientStore = useClientStore.getState();
  const imageStore = useImageStore.getState();

  const booking = bookingStore.bookings.find((b) => b.id === data.booking_id);
  const client = booking ? clientStore.clients.find((c) => c.id === booking.client_id) : null;
  const descriptor = booking && client
    ? `${client.name}'s ${booking.type.toLowerCase()}`
    : 'booking';

  store.replaceLastLoading({
    status: 'action_taken',
    actionLabel: `Deleting ${descriptor}...`,
  });

  try {
    // Clean up associated images first (same pattern BookingDrawer uses)
    imageStore.images
      .filter((img) => img.booking_id === data.booking_id)
      .forEach((img) => deleteImageBlob(img.id).catch(console.error));
    await bookingStore.deleteBooking(data.booking_id);
    ui.addToast(`Deleted ${descriptor}`);
    setTimeout(() => store.closePanel(), 300);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    store.replaceLastLoading({ text: `Failed to delete: ${msg}` });
  }
}

export function executeBookingEdit(data: ResolvedBookingEdit) {
  const store = useAgentStore.getState();
  const ui = useUIStore.getState();

  // Build prefill from changes — only include fields that actually have values
  const prefill: Record<string, unknown> = {};
  if (data.changes.date) prefill.date = data.changes.date;
  if (data.changes.end_date) prefill.end_date = data.changes.end_date;
  if (data.changes.duration) prefill.duration = data.changes.duration;
  if (data.changes.type) prefill.type = data.changes.type;
  if (data.changes.timeSlot) prefill.timeSlot = data.changes.timeSlot;
  if (data.changes.estimate) prefill.estimate = data.changes.estimate;
  if (data.changes.notes) prefill.notes = data.changes.notes;
  if (data.changes.rescheduled !== undefined) prefill.rescheduled = data.changes.rescheduled;
  if (data.changes.title) prefill.title = data.changes.title;
  if (data.changes.is_all_day !== undefined) prefill.is_all_day = data.changes.is_all_day;
  if (data.changes.blocks_availability !== undefined) prefill.blocks_availability = data.changes.blocks_availability;

  // Track only the fields that actually have values, not all keys
  ui.setChangedBookingFields(new Set(Object.keys(prefill)));

  ui.setPrefillBookingData(prefill as Parameters<typeof ui.setPrefillBookingData>[0]);

  store.replaceLastLoading({
    status: 'action_taken',
    actionLabel: 'Opening booking for editing...',
  });

  setTimeout(() => {
    store.closePanel();
    ui.openBookingForm(data.booking_id);
  }, 300);
}
