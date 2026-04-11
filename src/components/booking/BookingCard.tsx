import { format } from 'date-fns';
import type { Booking, BookingStatus } from '../../types';
import { useClientStore } from '../../stores/clientStore';
import { useUIStore } from '../../stores/uiStore';

const statusStyles: Record<BookingStatus, { dot: string; bg: string; border: string }> = {
  Confirmed: { dot: 'bg-[rgba(255,255,255,0.87)]', bg: 'bg-[rgba(255,255,255,0.05)]', border: 'border-[rgba(255,255,255,0.08)]' },
  Tentative: { dot: 'bg-[rgba(255,255,255,0.38)]', bg: 'bg-[rgba(255,255,255,0.03)]', border: 'border-[rgba(255,255,255,0.06)]' },
  Completed: { dot: 'bg-[#81C784]', bg: 'bg-[rgba(129,199,132,0.08)]', border: 'border-[rgba(129,199,132,0.12)]' },
  Cancelled: { dot: 'bg-[#CF6679]', bg: 'bg-[rgba(207,102,121,0.08)]', border: 'border-[rgba(207,102,121,0.12)]' },
  'No-show': { dot: 'bg-[#FFB74D]', bg: 'bg-[rgba(255,183,77,0.08)]', border: 'border-[rgba(255,183,77,0.12)]' },
};

interface BookingCardProps {
  booking: Booking;
  compact?: boolean;
}

export default function BookingCard({ booking, compact }: BookingCardProps) {
  const client = useClientStore((s) => s.getClient(booking.client_id ?? ''));
  const setSelectedBookingId = useUIStore((s) => s.setSelectedBookingId);
  const style = statusStyles[booking.status];

  // Mobile compact: just colored dots on the calendar grid
  if (compact) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSelectedBookingId(booking.id);
        }}
        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm ${style.bg} border ${style.border} cursor-pointer press-scale transition-all active:shadow-glow min-h-[44px]`}
      >
        <span className="text-text-s">{format(new Date(booking.date), 'h:mma')}</span>{' '}
        <span className="text-text-p font-medium">{client?.name.split(' ')[0]}</span>
        <span className="hidden lg:inline text-text-t"> &middot; {booking.type}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => setSelectedBookingId(booking.id)}
      className={`w-full text-left p-4 rounded-xl ${style.bg} border ${style.border} cursor-pointer press-scale transition-all duration-200 active:shadow-glow hover:shadow-glow hover:border-accent/20 min-h-[56px]`}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${style.dot} shrink-0`} />
        <span className="text-base text-text-p font-medium truncate">{client?.name ?? 'Walk-in'}</span>
      </div>
      <div className="text-sm text-text-s pl-[22px]">
        {format(new Date(booking.date), 'h:mm a')} &middot; {booking.type} &middot; {booking.duration}h
      </div>
    </button>
  );
}
