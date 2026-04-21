import { format } from 'date-fns';
import type { Booking } from '../../types';
import { getTypeColor, getTypeColorAlpha, getBookingLabel } from '../../types';
import { useClientStore } from '../../stores/clientStore';
import { useUIStore } from '../../stores/uiStore';

interface BookingCardProps {
  booking: Booking;
  compact?: boolean;
}

export default function BookingCard({ booking, compact }: BookingCardProps) {
  const client = useClientStore((s) => s.clients.find((c) => c.id === booking.client_id));
  const setSelectedBookingId = useUIStore((s) => s.setSelectedBookingId);
  const color = getTypeColor(booking.type);
  const label = getBookingLabel(booking, client?.name);
  // Compact pills only have room for the first token; personal titles stay whole.
  const compactLabel = booking.type === 'Personal' ? label : label.split(' ')[0];

  // Mobile compact: just colored dots on the calendar grid
  if (compact) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSelectedBookingId(booking.id);
        }}
        className="w-full text-left px-3 py-2.5 rounded-lg text-sm border border-border/30 cursor-pointer press-scale transition-all active:shadow-glow min-h-[44px]"
        style={{ borderLeftWidth: 3, borderLeftColor: color, backgroundColor: getTypeColorAlpha(booking.type, 0.07) }}
      >
        <span className="text-text-s">{format(new Date(booking.date), 'h:mma')}</span>{' '}
        <span className="text-text-p font-medium">{compactLabel}</span>
        <span className="hidden lg:inline text-text-t"> &middot; {booking.type}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => setSelectedBookingId(booking.id)}
      className="w-full text-left p-4 rounded-lg border border-border/30 cursor-pointer press-scale transition-all duration-200 active:shadow-glow hover:shadow-glow hover:border-accent/20 min-h-[56px]"
      style={{ borderLeftWidth: 3, borderLeftColor: color, backgroundColor: getTypeColorAlpha(booking.type, 0.07) }}
    >
      <div className="mb-1">
        <span className="text-base text-text-p font-medium truncate">{label}</span>
      </div>
      <div className="text-sm text-text-s">
        {format(new Date(booking.date), 'h:mm a')} &middot; {booking.type} &middot; {booking.duration}h
      </div>
    </button>
  );
}
