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

export type BookingType = 'Regular' | 'Touch Up' | 'Consultation' | 'Full Day' | 'Cover Up';
export type BookingStatus = 'Confirmed' | 'Tentative' | 'Completed' | 'Cancelled' | 'No-show';

const typeColorVar: Record<BookingType, string> = {
  Regular: '--color-type-regular',
  'Touch Up': '--color-type-touchup',
  Consultation: '--color-type-consult',
  'Full Day': '--color-type-fullday',
  'Cover Up': '--color-type-coverup',
};

const typeColorFallback: Record<BookingType, string> = {
  Regular: '#B813FF',
  'Touch Up': '#F67100',
  Consultation: '#FE84FF',
  'Full Day': '#FF00AC',
  'Cover Up': '#1E90FF',
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
  duration: number;
  type: BookingType;
  estimate?: number;
  status: BookingStatus;
  rescheduled?: boolean;
  notes?: string;
  quick_booking_raw?: string;
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
}

export type CalendarView = 'year' | 'month' | 'day';
