import { supabase } from '../lib/supabase';
import type { Booking } from '../types';

/** Transform a Supabase row into a frontend Booking object. */
function toBooking(row: Record<string, unknown>): Booking {
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    client_id: (row.client_id as string) ?? null,
    date: row.date as string,
    duration: row.duration as number,
    type: row.type as Booking['type'],
    estimate: (row.estimate as number) ?? undefined,
    status: row.status as Booking['status'],
    rescheduled: (row.rescheduled as boolean) ?? false,
    notes: (row.notes as string) ?? undefined,
    quick_booking_raw: (row.quick_booking_raw as string) ?? undefined,
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
  booking: Omit<Booking, 'id' | 'created_at'>
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      client_id: booking.client_id ?? null,
      date: booking.date,
      duration: booking.duration,
      type: booking.type,
      estimate: booking.estimate ?? null,
      status: booking.status,
      rescheduled: booking.rescheduled ?? false,
      notes: booking.notes ?? null,
      quick_booking_raw: booking.quick_booking_raw ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return toBooking(data);
}

export async function updateBooking(
  id: string,
  updates: Partial<Booking>
): Promise<void> {
  const { id: _id, created_at: _ca, ...dbUpdates } = updates as Record<string, unknown>;

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dbUpdates)) {
    payload[key] = value === undefined ? null : value;
  }

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
