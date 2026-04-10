import {
  format,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
} from 'date-fns';
import { ChevronLeft, Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { BookingStatus } from '../../types';

const statusBg: Record<BookingStatus, string> = {
  Confirmed: 'bg-[rgba(240,237,232,0.06)]',
  Tentative: 'bg-[rgba(107,101,96,0.10)]',
  Completed: 'bg-[rgba(61,140,92,0.08)]',
  Cancelled: 'bg-[rgba(122,53,53,0.10)]',
  'No-show': 'bg-[rgba(138,106,42,0.10)]',
};

const statusDot: Record<BookingStatus, string> = {
  Confirmed: 'bg-text-p',
  Tentative: 'bg-[#6B6560]',
  Completed: 'bg-[#3D8C5C]',
  Cancelled: 'bg-[#7A3535]',
  'No-show': 'bg-[#8A6A2A]',
};

const hours = Array.from({ length: 24 }, (_, i) => i);

export default function DayView() {
  const { calendarDate, setCalendarDate, setCalendarView, openBookingForm, setSelectedBookingId, setPrefillBookingData } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const weekStart = startOfWeek(calendarDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(calendarDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const dayBookings = bookings
    .filter((b) => isSameDay(new Date(b.date), calendarDate))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hourHeight = 64;

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

  const handleBack = () => {
    setCalendarView('month');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-2 flex items-center justify-between shrink-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-today active:opacity-70 transition-opacity cursor-pointer press-scale min-h-[44px]"
        >
          <ChevronLeft size={20} />
          <span className="text-lg font-medium">{format(calendarDate, 'MMMM')}</span>
        </button>
        <button
          onClick={() => openBookingForm()}
          className="w-12 h-12 bg-accent text-bg rounded-xl flex items-center justify-center cursor-pointer press-scale transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 px-6 py-2 border-b border-border/30 shrink-0">
        {weekDays.map((day) => {
          const today = isToday(day);
          const selected = isSameDay(day, calendarDate);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setCalendarDate(day)}
              className="flex flex-col items-center gap-1 py-1 cursor-pointer transition-colors"
            >
              <span
                className={`text-xs font-medium ${
                  today && !selected ? 'text-today' : 'text-text-t'
                }`}
              >
                {format(day, 'EEEEE')}
              </span>
              <span
                className={`w-9 h-9 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  selected && today
                    ? 'bg-today text-white'
                    : selected
                    ? 'bg-text-p text-bg'
                    : today
                    ? 'text-today'
                    : 'text-text-p'
                }`}
              >
                {format(day, 'd')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative" style={{ minHeight: hours.length * hourHeight }}>
          {/* Hour grid */}
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute w-full border-b border-border/15 flex active:bg-elevated/20 cursor-pointer transition-colors"
              style={{ top: hour * hourHeight, height: hourHeight }}
              onClick={() => handleSlotClick(hour)}
            >
              <div className="w-16 text-xs text-text-t py-2 text-right pr-4 shrink-0">
                {format(new Date(2026, 0, 1, hour), 'h a')}
              </div>
              <div className="flex-1 border-l border-border/20" />
            </div>
          ))}

          {/* Booking blocks */}
          {dayBookings.map((booking) => {
            const d = new Date(booking.date);
            const startHour = d.getHours() + d.getMinutes() / 60;
            const top = startHour * hourHeight;
            const height = booking.duration * hourHeight;
            const client = getClient(booking.client_id ?? '');

            return (
              <button
                key={booking.id}
                className={`absolute left-16 right-6 rounded-xl p-4 ${statusBg[booking.status]} border border-border/30 cursor-pointer press-scale transition-all active:shadow-glow text-left`}
                style={{ top, height: Math.max(height, 48) }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedBookingId(booking.id);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusDot[booking.status]} shrink-0`} />
                  <span className="text-base text-text-p font-medium truncate">
                    {client?.display_name || client?.name || 'Walk-in'}
                  </span>
                </div>
                <div className="text-sm text-text-s mt-1 pl-[18px]">
                  {format(d, 'h:mm a')} · {booking.type} · {booking.duration}h
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
