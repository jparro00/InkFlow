import { useClientStore } from '../stores/clientStore';

interface ParsedBooking {
  client_id?: string;
  date?: string;
  duration?: number;
  type?: string;
}

export function parseQuickBooking(text: string): ParsedBooking {
  const result: ParsedBooking = {};
  const lower = text.toLowerCase();

  // Try to match client name
  const clients = useClientStore.getState().clients;
  for (const client of clients) {
    const firstName = client.name.split(' ')[0].toLowerCase();
    const fullName = client.name.toLowerCase();
    if (lower.includes(fullName) || lower.includes(firstName)) {
      result.client_id = client.id;
      break;
    }
  }

  // Duration
  const durationMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (durationMatch) {
    result.duration = parseFloat(durationMatch[1]);
  }

  // Type
  if (lower.includes('consultation') || lower.includes('consult')) {
    result.type = 'Consultation';
  } else if (lower.includes('touch up') || lower.includes('touchup') || lower.includes('touch-up')) {
    result.type = 'Touch Up';
  } else if (lower.includes('full day') || lower.includes('fullday')) {
    result.type = 'Full Day';
  } else if (lower.includes('cover up') || lower.includes('coverup') || lower.includes('cover-up')) {
    result.type = 'Cover Up';
  } else {
    result.type = 'Regular';
  }

  // Date/time
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const min = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (timeMatch[3] === 'pm' && hour < 12) hour += 12;
    if (timeMatch[3] === 'am' && hour === 12) hour = 0;

    const now = new Date();
    let targetDate = new Date(now);

    if (lower.includes('tomorrow')) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (lower.includes('monday')) {
      targetDate = getNextWeekday(now, 1);
    } else if (lower.includes('tuesday')) {
      targetDate = getNextWeekday(now, 2);
    } else if (lower.includes('wednesday')) {
      targetDate = getNextWeekday(now, 3);
    } else if (lower.includes('thursday')) {
      targetDate = getNextWeekday(now, 4);
    } else if (lower.includes('friday')) {
      targetDate = getNextWeekday(now, 5);
    } else if (lower.includes('saturday')) {
      targetDate = getNextWeekday(now, 6);
    } else if (lower.includes('sunday')) {
      targetDate = getNextWeekday(now, 0);
    }

    targetDate.setHours(hour, min, 0, 0);
    result.date = targetDate.toISOString();
  }

  return result;
}

function getNextWeekday(from: Date, dayOfWeek: number): Date {
  const d = new Date(from);
  const diff = (dayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  return d;
}
