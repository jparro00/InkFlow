import { useBookingStore } from '../stores/bookingStore';
import { useAgentStore } from '../stores/agentStore';
import { scheduleConfig } from './scheduleConfig';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays } from 'date-fns';
import type { ResolvedScheduleQuery } from './types';

/**
 * Schedule Agent — computes everything locally from bookingStore data.
 * No AI call, no DB call. Panel stays open for follow-up queries.
 */

export function executeScheduleQuery(data: ResolvedScheduleQuery) {
  const store = useAgentStore.getState();
  const bookings = useBookingStore.getState().bookings;

  const now = new Date();
  const rangeStart = data.date_range_start ? new Date(data.date_range_start) : startOfWeek(now, { weekStartsOn: 1 });
  const rangeEnd = data.date_range_end ? new Date(data.date_range_end) : endOfWeek(now, { weekStartsOn: 1 });

  // Overlap-based range filter: a booking belongs in the range if its
  // [date, end_date) interval intersects [rangeStart, rangeEnd].
  // (Multi-day vacations starting outside the range still show up for days they cover.)
  const inRange = bookings.filter((b) => {
    const start = new Date(b.date);
    const end = new Date(b.end_date);
    return (
      start <= rangeEnd &&
      end >= rangeStart &&
      b.status !== 'Cancelled' &&
      b.status !== 'No-show'
    );
  });

  // Further filter by booking type if specified
  const filtered = data.booking_type
    ? inRange.filter((b) => b.type.toLowerCase() === data.booking_type!.toLowerCase())
    : inRange;

  const rangeLabel = formatRange(rangeStart, rangeEnd);

  switch (data.query_type) {
    case 'count': {
      const typeLabel = data.booking_type ?? 'booking';
      const plural = filtered.length === 1 ? typeLabel : `${typeLabel}s`;
      store.replaceLastLoading({
        text: `You have **${filtered.length} ${plural}** ${rangeLabel}.`,
        scheduleData: {
          type: 'count',
          count: filtered.length,
          bookings: filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        },
      });
      break;
    }

    case 'list': {
      const sorted = filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (sorted.length === 0) {
        store.replaceLastLoading({
          text: `No bookings ${rangeLabel}.`,
          scheduleData: { type: 'list', bookings: [] },
        });
      } else {
        store.replaceLastLoading({
          text: `${sorted.length} booking${sorted.length === 1 ? '' : 's'} ${rangeLabel}:`,
          scheduleData: { type: 'list', bookings: sorted },
        });
      }
      break;
    }

    case 'available': {
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      const { workingDays, workingHours, morningStart, eveningStart, defaultSessionDuration } = scheduleConfig;
      const dayStartMin = toMinutes(workingHours.start);
      const dayEndMin = toMinutes(workingHours.end);
      const morningStartMin = toMinutes(morningStart);
      const eveningStartMin = toMinutes(eveningStart);
      const sessionMin = defaultSessionDuration * 60;

      const lines: string[] = [];

      for (const day of days) {
        const dow = day.getDay();
        if (!workingDays.includes(dow)) {
          // Non-working day — note it but mark as not counted
          continue;
        }

        // Include any booking whose interval overlaps this day (not just starts on it),
        // so multi-day vacations block all covered days.
        const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
        const dayEndDate = new Date(dayStart); dayEndDate.setDate(dayEndDate.getDate() + 1);
        const dayBookings = inRange
          .filter((b) => {
            const start = new Date(b.date);
            const end = new Date(b.end_date);
            return start < dayEndDate && end > dayStart;
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const dayLabel = format(day, 'EEEE, MMM d');

        // Non-blocking Personal events are informational only — ignore for availability.
        const blockingBookings = dayBookings.filter(
          (b) => !(b.type === 'Personal' && !b.blocks_availability)
        );

        if (blockingBookings.length === 0) {
          lines.push(`• ${dayLabel} — fully open`);
          continue;
        }

        // Build occupied ranges, clipped to this day's [00:00, 24:00) window.
        const occupied = blockingBookings.map((b) => {
          const bStart = new Date(b.date);
          const bEnd = new Date(b.end_date);
          const clippedStart = bStart < dayStart ? dayStart : bStart;
          const clippedEnd = bEnd > dayEndDate ? dayEndDate : bEnd;
          const startMin = (clippedStart.getTime() - dayStart.getTime()) / 60000;
          const endMin = (clippedEnd.getTime() - dayStart.getTime()) / 60000;
          return { start: startMin, end: endMin };
        });

        // Morning block: dayStart → eveningStart
        const morningFree = hasFreeSlot(
          occupied,
          Math.max(dayStartMin, morningStartMin),
          eveningStartMin,
          sessionMin
        );
        // Evening block: eveningStart → dayEnd
        const eveningFree = hasFreeSlot(occupied, eveningStartMin, dayEndMin, sessionMin);

        if (morningFree && eveningFree) {
          lines.push(`• ${dayLabel} — morning & evening free`);
        } else if (morningFree) {
          lines.push(`• ${dayLabel} — morning free (evening booked)`);
        } else if (eveningFree) {
          lines.push(`• ${dayLabel} — evening free (morning booked)`);
        } else {
          const count = blockingBookings.length;
          lines.push(`• ${dayLabel} — fully booked (${count} session${count === 1 ? '' : 's'})`);
        }
      }

      if (lines.length === 0) {
        store.replaceLastLoading({
          text: `No working days ${rangeLabel} based on your schedule config.`,
          scheduleData: { type: 'available' },
        });
      } else {
        store.replaceLastLoading({
          text: `Availability ${rangeLabel}:`,
          scheduleData: {
            type: 'available',
            summary: lines.join('\n'),
          },
        });
      }
      break;
    }

    case 'summary': {
      const byType: Record<string, { count: number; hours: number }> = {};
      let totalHours = 0;
      for (const b of filtered) {
        if (!byType[b.type]) byType[b.type] = { count: 0, hours: 0 };
        byType[b.type].count++;
        byType[b.type].hours += b.duration;
        totalHours += b.duration;
      }

      const lines = Object.entries(byType)
        .map(([type, data]) => `• ${type}: ${data.count} (${data.hours}h)`)
        .join('\n');

      store.replaceLastLoading({
        text: `Schedule summary ${rangeLabel}:`,
        scheduleData: {
          type: 'summary',
          count: filtered.length,
          summary: `${lines}\n\nTotal: ${filtered.length} bookings, ${totalHours}h`,
          bookings: filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        },
      });
      break;
    }
  }
}

/** Convert "HH:MM" to minutes from midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Find the soonest open booking slot that matches the preference.
 * Scans up to 60 days forward starting today, respecting workingDays
 * and excluding already-past hours on today.
 *
 * Returns { iso, timeSlot } where iso is the datetime for the booking
 * and timeSlot indicates which block ('morning' | 'evening') was picked.
 * Returns null if nothing open found in the search window.
 */
export function findFirstAvailableSlot(
  preference: 'morning' | 'evening' | 'any'
): { iso: string; timeSlot: 'morning' | 'evening' } | null {
  const bookings = useBookingStore.getState().bookings;
  const {
    workingDays,
    workingHours,
    morningStart,
    eveningStart,
    defaultSessionDuration,
  } = scheduleConfig;
  const dayStartMin = toMinutes(workingHours.start);
  const dayEndMin = toMinutes(workingHours.end);
  const morningStartMin = toMinutes(morningStart);
  const eveningStartMin = toMinutes(eveningStart);
  const sessionMin = defaultSessionDuration * 60;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  for (let i = 0; i < 60; i++) {
    const day = addDays(todayStart, i);
    const dow = day.getDay();
    if (!workingDays.includes(dow)) continue;

    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEndDate = new Date(dayStart); dayEndDate.setDate(dayEndDate.getDate() + 1);

    // Overlap semantics + skip non-blocking Personal events.
    const dayBookings = bookings.filter((b) => {
      if (b.status === 'Cancelled' || b.status === 'No-show') return false;
      if (b.type === 'Personal' && !b.blocks_availability) return false;
      const start = new Date(b.date);
      const end = new Date(b.end_date);
      return start < dayEndDate && end > dayStart;
    });

    // Clip each booking's range to this day's [00:00, 24:00) window.
    const occupied: Array<{ start: number; end: number }> = dayBookings.map((b) => {
      const bStart = new Date(b.date);
      const bEnd = new Date(b.end_date);
      const clippedStart = bStart < dayStart ? dayStart : bStart;
      const clippedEnd = bEnd > dayEndDate ? dayEndDate : bEnd;
      const startMin = (clippedStart.getTime() - dayStart.getTime()) / 60000;
      const endMin = (clippedEnd.getTime() - dayStart.getTime()) / 60000;
      return { start: startMin, end: endMin };
    });

    // If checking today, treat already-passed minutes as occupied so we never
    // suggest a slot in the past.
    if (i === 0) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      occupied.push({ start: 0, end: nowMin });
    }

    if (preference === 'morning' || preference === 'any') {
      if (
        hasFreeSlot(
          occupied,
          Math.max(dayStartMin, morningStartMin),
          eveningStartMin,
          sessionMin
        )
      ) {
        return { iso: combineDateTime(day, morningStart), timeSlot: 'morning' };
      }
    }

    if (preference === 'evening' || preference === 'any') {
      if (hasFreeSlot(occupied, eveningStartMin, dayEndMin, sessionMin)) {
        return { iso: combineDateTime(day, eveningStart), timeSlot: 'evening' };
      }
    }
  }

  return null;
}

function combineDateTime(day: Date, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/**
 * Check whether a gap of at least `sessionMin` minutes exists within
 * the [blockStart, blockEnd) window that does not overlap any occupied range.
 */
function hasFreeSlot(
  occupied: Array<{ start: number; end: number }>,
  blockStart: number,
  blockEnd: number,
  sessionMin: number
): boolean {
  if (blockEnd - blockStart < sessionMin) return false;

  // Clip occupied ranges to the block window and sort
  const inBlock = occupied
    .map((o) => ({ start: Math.max(o.start, blockStart), end: Math.min(o.end, blockEnd) }))
    .filter((o) => o.start < o.end)
    .sort((a, b) => a.start - b.start);

  let cursor = blockStart;
  for (const o of inBlock) {
    if (o.start - cursor >= sessionMin) return true;
    cursor = Math.max(cursor, o.end);
  }
  return blockEnd - cursor >= sessionMin;
}

function formatRange(start: Date, end: Date): string {
  const now = new Date();
  const startDay = format(start, 'yyyy-MM-dd');
  const endDay = format(end, 'yyyy-MM-dd');
  const todayStr = format(now, 'yyyy-MM-dd');

  // Same day
  if (startDay === endDay) {
    if (startDay === todayStr) return 'today';
    const tomorrow = addDays(now, 1);
    if (startDay === format(tomorrow, 'yyyy-MM-dd')) return 'tomorrow';
    return `on ${format(start, 'EEEE, MMM d')}`;
  }

  // This week
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  if (startDay === weekStart && endDay === weekEnd) return 'this week';

  return `from ${format(start, 'MMM d')} to ${format(end, 'MMM d')}`;
}
