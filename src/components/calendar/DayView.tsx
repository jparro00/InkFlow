import { format, isSameDay } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { BookingStatus } from '../../types';

const hours = Array.from({ length: 13 }, (_, i) => i + 8);

const statusDot: Record<BookingStatus, string> = {
  Confirmed: 'bg-text-p',
  Tentative: 'bg-[#6B6560]',
  Completed: 'bg-[#3D8C5C]',
  Cancelled: 'bg-[#7A3535]',
  'No-show': 'bg-[#8A6A2A]',
};

const statusBg: Record<BookingStatus, string> = {
  Confirmed: 'bg-[rgba(240,237,232,0.06)]',
  Tentative: 'bg-[rgba(107,101,96,0.10)]',
  Completed: 'bg-[rgba(61,140,92,0.08)]',
  Cancelled: 'bg-[rgba(122,53,53,0.10)]',
  'No-show': 'bg-[rgba(138,106,42,0.10)]',
};

export default function DayView() {
  const calendarDate = useUIStore((s) => s.calendarDate);
  const setSelectedBookingId = useUIStore((s) => s.setSelectedBookingId);
  const openBookingForm = useUIStore((s) => s.openBookingForm);
  const setPrefillBookingData = useUIStore((s) => s.setPrefillBookingData);
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const dayBookings = bookings
    .filter((b) => isSameDay(new Date(b.date), calendarDate))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hourHeight = 80;

  const handleSlotClick = (hour: number) => {
    const dateStr = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth(),
      calendarDate.getDate(),
      hour,
      0
    ).toISOString();
    setPrefillBookingData({ date: dateStr });
    openBookingForm();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="relative" style={{ minHeight: hours.length * hourHeight }}>
        {/* Hour grid lines */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute w-full border-b border-border/20 flex active:bg-elevated/20 cursor-pointer transition-colors"
            style={{ top: (hour - 8) * hourHeight, height: hourHeight }}
            onClick={() => handleSlotClick(hour)}
          >
            <div className="w-16 lg:w-20 text-sm text-text-t py-3 text-right pr-4 shrink-0">
              {format(new Date(2026, 0, 1, hour), 'h a')}
            </div>
            <div className="flex-1 border-l border-border/20" />
          </div>
        ))}

        {/* Booking blocks */}
        {dayBookings.map((booking) => {
          const d = new Date(booking.date);
          const startHour = d.getHours() + d.getMinutes() / 60;
          const top = (startHour - 8) * hourHeight;
          const height = booking.duration * hourHeight;
          const client = getClient(booking.client_id ?? '');

          return (
            <button
              key={booking.id}
              className={`absolute left-16 lg:left-20 right-4 lg:right-4 rounded-xl p-4 lg:p-4 ${statusBg[booking.status]} border border-border/30 cursor-pointer press-scale transition-all active:shadow-glow hover:shadow-glow hover:border-accent/20 text-left`}
              style={{ top, height: Math.max(height, 56) }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBookingId(booking.id);
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${statusDot[booking.status]} shrink-0`} />
                <span className="text-base text-text-p font-medium truncate">
                  {client?.name ?? 'Walk-in'}
                </span>
              </div>
              <div className="text-sm text-text-s mt-1.5 pl-5">
                {format(d, 'h:mm a')} &middot; {booking.type} &middot; {booking.duration}h
              </div>
              {booking.style && height > 60 && (
                <div className="text-sm text-text-t mt-1 pl-5">
                  {booking.style} &middot; {booking.placement}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
