import type { Booking } from '../types';

function formatICSDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Generate an iCalendar (.ics) string for a booking. */
function generateICS(booking: Booking, clientName: string): string {
  const start = new Date(booking.date);
  const end = new Date(start.getTime() + booking.duration * 60 * 60 * 1000);

  // Floating time (no Z suffix) — iOS interprets as the device's local timezone
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InkBloop//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.id}@inkbloop`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${clientName} — ${booking.type}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Generate and trigger download of a .ics file for a booking. */
export function exportBookingToCalendar(booking: Booking, clientName: string): void {
  const ics = generateICS(booking, clientName);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${clientName.replace(/\s+/g, '-').toLowerCase()}-${booking.type.replace(/\s+/g, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
