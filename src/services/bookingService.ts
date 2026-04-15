import { supabase } from '../lib/supabase';
import type { Booking } from '../types';
import type { Database } from '../types/database';

type BookingRow = Database['public']['Tables']['bookings']['Row'];
type BookingInsert = Database['public']['Tables']['bookings']['Insert'];
type BookingUpdate = Database['public']['Tables']['bookings']['Update'];

/** Transform a Supabase row into a frontend Booking object. */
function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    created_at: row.created_at,
    client_id: row.client_id ?? null,
    date: row.date,
    duration: row.duration,
    type: row.type as Booking['type'],
    estimate: row.estimate ?? undefined,
    status: row.status as Booking['status'],
    rescheduled: row.rescheduled ?? false,
    notes: row.notes ?? undefined,
    quick_booking_raw: row.quick_booking_raw ?? undefined,
  };
}

export async function fetchBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toBooking);
}

export async function createBooking(
  booking: Omit<Booking, 'id' | 'created_at'>,
  id?: string
): Promise<Booking> {
  const row: BookingInsert = {
    ...(id ? { id } : {}),
    client_id: booking.client_id ?? null,
    date: booking.date,
    duration: booking.duration,
    type: booking.type,
    estimate: booking.estimate ?? null,
    status: booking.status,
    rescheduled: booking.rescheduled ?? false,
    notes: booking.notes ?? null,
    quick_booking_raw: booking.quick_booking_raw ?? null,
  };

  const { data, error } = await supabase
    .from('bookings')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return toBooking(data);
}

export async function updateBooking(
  id: string,
  updates: Partial<Booking>
): Promise<void> {
  const payload: BookingUpdate = {};

  if (updates.client_id !== undefined) payload.client_id = updates.client_id ?? null;
  if (updates.date !== undefined) payload.date = updates.date;
  if (updates.duration !== undefined) payload.duration = updates.duration;
  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.estimate !== undefined) payload.estimate = updates.estimate ?? null;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.rescheduled !== undefined) payload.rescheduled = updates.rescheduled;
  if (updates.notes !== undefined) payload.notes = updates.notes ?? null;
  if (updates.quick_booking_raw !== undefined) payload.quick_booking_raw = updates.quick_booking_raw ?? null;

  const { error } = await supabase
    .from('bookings')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
