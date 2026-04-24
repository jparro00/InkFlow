import type { Booking } from '../types';
import { getBookingLabel } from '../types';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Local-time DATE-TIME form (YYYYMMDDTHHMMSS, no timezone — iOS treats as floating). */
function formatICSDateTime(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/** DATE form (YYYYMMDD) for all-day events per RFC 5545 §3.3.4. */
function formatICSDateOnly(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** Escape iCal TEXT values (backslash, comma, semicolon, newline). RFC 5545 §3.3.11. */
function escapeICSText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Generate an iCalendar (.ics) string for a booking. Handles three shapes:
 * - All-day (is_all_day=true): DTSTART/DTEND use VALUE=DATE; DTEND is exclusive
 *   (already stored that way — midnight after the last covered day).
 * - Timed single or multi-day: DTSTART/DTEND use floating local DATE-TIME.
 * - Non-blocking (blocks_availability=false): TRANSP:TRANSPARENT so the user's
 *   device calendar treats the event as "free" and doesn't show a conflict.
 */
function generateICS(booking: Booking, clientName: string): string {
  const start = new Date(booking.date);
  const end = new Date(booking.end_date);
  const summary = booking.type === 'Personal'
    ? getBookingLabel(booking)
    : `${clientName} — ${booking.type}`;
  const transp = booking.blocks_availability ? 'OPAQUE' : 'TRANSPARENT';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InkBloop//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.id}@inkbloop`,
    `DTSTAMP:${formatICSDateTime(new Date())}`,
  ];

  if (booking.is_all_day) {
    lines.push(`DTSTART;VALUE=DATE:${formatICSDateOnly(start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatICSDateOnly(end)}`);
  } else {
    lines.push(`DTSTART:${formatICSDateTime(start)}`);
    lines.push(`DTEND:${formatICSDateTime(end)}`);
  }

  lines.push(`SUMMARY:${escapeICSText(summary)}`);
  lines.push(`TRANSP:${transp}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

/** Generate and trigger download of a .ics file for a booking. */
export function exportBookingToCalendar(booking: Booking, clientName: string): void {
  const ics = generateICS(booking, clientName);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const nameSlug = booking.type === 'Personal'
    ? (booking.title || 'personal').replace(/\s+/g, '-').toLowerCase()
    : clientName.replace(/\s+/g, '-').toLowerCase();
  a.download = `${nameSlug}-${booking.type.replace(/\s+/g, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
