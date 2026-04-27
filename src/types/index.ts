export type ClientChannel = 'Facebook' | 'Instagram' | 'Phone';

export interface Client {
  id: string;
  created_at: string;
  name: string;
  display_name?: string;
  phone?: string;
  instagram?: string;
  facebook?: string;
  dob?: string;
  channel?: ClientChannel;
  tags: string[];
  notes: ClientNote[];
  profile_pic?: string;
}

export interface LinkedProfile {
  psid: string;
  name: string;
  platform: 'instagram' | 'messenger';
  profilePic?: string;
}

export interface ClientNote {
  ts: string;
  text: string;
}

export type BookingType = 'Regular' | 'Touch Up' | 'Consultation' | 'Full Day' | 'Cover Up' | 'Personal';
export type BookingStatus = 'Confirmed' | 'Tentative' | 'Completed' | 'Cancelled' | 'No-show';

const typeColorVar: Record<BookingType, string> = {
  Regular: '--color-type-regular',
  'Touch Up': '--color-type-touchup',
  Consultation: '--color-type-consult',
  'Full Day': '--color-type-fullday',
  'Cover Up': '--color-type-coverup',
  Personal: '--color-type-personal',
};

const typeColorFallback: Record<BookingType, string> = {
  Regular: '#B813FF',
  'Touch Up': '#F67100',
  Consultation: '#FE84FF',
  'Full Day': '#FF00AC',
  'Cover Up': '#1E90FF',
  Personal: '#10D897',
};

function readCssColor(varName: string, fallback: string): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/** Reads the current booking-type color from CSS variables (live-themeable). */
export function getTypeColor(type: BookingType): string {
  return readCssColor(typeColorVar[type], typeColorFallback[type]);
}

/** Returns rgba() string for a booking type color at the given alpha (0–1). */
export function getTypeColorAlpha(type: BookingType, alpha: number): string {
  const hex = getTypeColor(type);
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
}

/**
 * @deprecated Use getTypeColor(type) for live-themeable colors.
 * Kept as a static lookup for non-render contexts.
 */
export const typeColor: Record<BookingType, string> = typeColorFallback;

export interface Booking {
  id: string;
  created_at: string;
  client_id: string | null;
  date: string;
  /** Inclusive end timestamp. For timed bookings equals date + duration hours. */
  end_date: string;
  duration: number;
  /** True when the booking occupies whole calendar days (Personal type only). */
  is_all_day: boolean;
  /** When false, the schedule agent treats this as informational and ignores it for availability. */
  blocks_availability: boolean;
  type: BookingType;
  estimate?: number;
  status: BookingStatus;
  rescheduled?: boolean;
  notes?: string;
  quick_booking_raw?: string;
  /** Free-text label for Personal bookings (not tied to a client). Max 30 chars. */
  title?: string;
}

/** True when this booking's [date, end_date) interval overlaps the calendar day `day`. */
export function bookingOverlapsDay(booking: Booking, day: Date): boolean {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const start = new Date(booking.date);
  const end = new Date(booking.end_date);
  return start < dayEnd && end > dayStart;
}

/** True when the booking spans more than a single calendar day. */
export function bookingIsMultiDay(booking: Booking): boolean {
  const start = new Date(booking.date);
  const end = new Date(booking.end_date);
  const startDay = new Date(start); startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
  // Treat end on next-day 00:00 (all-day single day) as not multi-day
  if (end.getTime() === endDay.getTime() && (endDay.getTime() - startDay.getTime()) === 86400000) return false;
  return endDay > startDay;
}

/**
 * Display label for a booking: the title for Personal bookings, otherwise the
 * resolved client name (or "Walk-in" fallback). Callers pass in the client
 * name separately so this helper stays free of store dependencies.
 */
export function getBookingLabel(booking: Booking, clientName?: string): string {
  if (booking.type === 'Personal') return booking.title || 'Personal';
  return clientName || 'Walk-in';
}

export interface Document {
  id: string;
  created_at: string;
  client_id: string;
  booking_id?: string;
  type: 'image' | 'consent_form' | 'other';
  label?: string;
  storage_path: string;
  is_sensitive: boolean;
  mime_type?: string;
  size_bytes?: number;
  notes?: string;
  storage_backend?: StorageBackend;
}

export interface AgeVerificationLog {
  id: string;
  created_at: string;
  client_id: string;
  verified_at: string;
  verified_by: string;
  document_deleted: boolean;
  notes?: string;
}

export type ImageSyncStatus = 'local' | 'uploading' | 'synced' | 'error';
export type StorageBackend = 'supabase' | 'r2';

export interface BookingImage {
  id: string;
  booking_id: string;
  created_at: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  sync_status: ImageSyncStatus;
  remote_path?: string;
  storage_backend?: StorageBackend;
}

export type CalendarView = 'year' | 'month' | 'day';

export type ConsentSubmissionStatus = 'submitted' | 'approved_pending' | 'finalized';

export interface ConsentSubmission {
  id: string;
  user_id: string;
  status: ConsentSubmissionStatus;

  license_image_key?: string;
  license_first_name?: string;
  license_last_name?: string;
  license_dob?: string;
  license_number?: string;
  license_address?: string;
  license_state?: string;
  license_expiry?: string;
  license_raw_data?: unknown;

  form_data: Record<string, unknown>;
  signature_image_key?: string;
  /** Signed consent PDF, generated client-side at submit time. R2 key. */
  pdf_key?: string;

  booking_id?: string;

  /** Payment is artist-entered post-tattoo for bookkeeping. The tattoo
   *  location/description are CLIENT-entered during the wizard and baked into
   *  the signed PDF — they're stored on the row for queryability but the PDF
   *  is the legal record. */
  payment_type?: string;
  payment_amount?: number;
  tattoo_location?: string;
  tattoo_description?: string;

  submitted_at: string;
  approved_at?: string;
  finalized_at?: string;

  created_at: string;
}

export function consentSubmissionDisplayName(s: ConsentSubmission): string {
  const first = s.license_first_name?.trim();
  const last = s.license_last_name?.trim();
  if (first && last) return `${first} ${last}`;
  if (first || last) return (first ?? last) ?? 'Unknown';
  return 'Unknown';
}

export function consentSubmissionIsComplete(s: ConsentSubmission): boolean {
  return Boolean(
    s.booking_id &&
    s.payment_type &&
    s.payment_amount !== undefined && s.payment_amount !== null
  );
}
