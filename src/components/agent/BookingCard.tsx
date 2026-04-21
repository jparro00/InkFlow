import { format } from 'date-fns';
import type { Booking } from '../../types';
import { getTypeColor, getBookingLabel } from '../../types';
import { useClientStore } from '../../stores/clientStore';

interface BookingCardProps {
  booking: Booking;
  onSelect?: (bookingId: string) => void;
}

export default function BookingCard({ booking, onSelect }: BookingCardProps) {
  const clients = useClientStore((s) => s.clients);
  const client = clients.find((c) => c.id === booking.client_id);
  const label = getBookingLabel(booking, client?.name);
  const typeColor = getTypeColor(booking.type);
  const d = new Date(booking.date);

  return (
    <button
      onClick={() => onSelect?.(booking.id)}
      disabled={!onSelect}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg bg-surface/60 border border-border/40 transition-colors ${
        onSelect
          ? 'active:bg-elevated/60 cursor-pointer press-scale'
          : 'cursor-default'
      }`}
    >
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: typeColor }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] text-text-p truncate">
          {label} · {booking.type}
        </div>
        <div className="text-[13px] text-text-t">
          {format(d, 'EEE, MMM d · h:mm a')} · {booking.duration}h ·{' '}
          {booking.status}
        </div>
      </div>
    </button>
  );
}
