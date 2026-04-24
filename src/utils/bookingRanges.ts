import { type Booking, bookingIsMultiDay } from '../types';

/**
 * A booking is "bar-worthy" if it renders as a multi-day/all-day ribbon rather
 * than a single-day pill or hour-grid card. Any all-day booking qualifies,
 * plus any timed booking whose range spans more than one calendar day.
 */
export function isBarBooking(b: Booking): boolean {
  return b.is_all_day || bookingIsMultiDay(b);
}

/**
 * All bookings whose [date, end_date) interval overlaps the given day.
 * Sorted by earliest start, then longest duration first so packers can lay
 * out longer bars on top rows.
 */
export function getOverlappingBookings(day: Date, bookings: Booking[]): Booking[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();

  return bookings
    .filter((b) => {
      const s = new Date(b.date).getTime();
      const e = new Date(b.end_date).getTime();
      return s < dayEndMs && e > dayStartMs;
    })
    .sort((a, b) => {
      const aStart = new Date(a.date).getTime();
      const bStart = new Date(b.date).getTime();
      if (aStart !== bStart) return aStart - bStart;
      const aLen = new Date(a.end_date).getTime() - aStart;
      const bLen = new Date(b.end_date).getTime() - bStart;
      return bLen - aLen;
    });
}

/** Bar-worthy bookings (all-day OR multi-day) overlapping the given day. */
export function getBarBookingsForDay(day: Date, bookings: Booking[]): Booking[] {
  return getOverlappingBookings(day, bookings).filter(isBarBooking);
}
