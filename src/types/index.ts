export interface Client {
  id: string;
  created_at: string;
  name: string;
  display_name?: string;
  phone?: string;
  instagram?: string;
  facebook_id?: string;
  email?: string;
  dob?: string;
  tags: string[];
  notes: ClientNote[];
}

export interface ClientNote {
  ts: string;
  text: string;
}

export type BookingType = 'Consultation' | 'New Tattoo' | 'Touch-up' | 'Cover-up';
export type BookingStatus = 'Confirmed' | 'Tentative' | 'Completed' | 'Cancelled' | 'No-show';

export interface Booking {
  id: string;
  created_at: string;
  client_id: string | null;
  date: string;
  duration: number;
  type: BookingType;
  estimate?: number;
  status: BookingStatus;
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

export type CalendarView = 'year' | 'month' | 'day';
