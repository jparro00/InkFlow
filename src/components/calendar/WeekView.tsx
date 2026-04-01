import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  isSameDay,
} from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import BookingCard from '../booking/BookingCard';

export default function WeekView() {
  const calendarDate = useUIStore((s) => s.calendarDate);
  const bookings = useBookingStore((s) => s.bookings);

  const weekStart = startOfWeek(calendarDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(calendarDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getBookingsForDay = (day: Date) =>
    bookings
      .filter((b) => isSameDay(new Date(b.date), day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="flex-1 overflow-x-auto">
      {/* Mobile: horizontal scroll. Desktop: grid */}
      <div className="flex lg:grid lg:grid-cols-7 lg:divide-x lg:divide-border/30 min-w-[700px] lg:min-w-0 h-full">
        {days.map((day) => {
          const dayBookings = getBookingsForDay(day);
          const today = isToday(day);

          return (
            <div key={day.toISOString()} className="flex flex-col min-w-[160px] lg:min-w-0">
              {/* Day header */}
              <div className={`px-4 py-4 border-b border-border/30 text-center ${today ? 'bg-accent-glow' : ''}`}>
                <div className="text-sm text-text-t uppercase font-medium">
                  {format(day, 'EEE')}
                </div>
                <div
                  className={`font-display text-xl mt-1 ${
                    today ? 'text-accent' : 'text-text-p'
                  }`}
                >
                  {format(day, 'd')}
                </div>
              </div>

              {/* Booking cards */}
              <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto">
                {dayBookings.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
                {dayBookings.length === 0 && (
                  <div className="flex-1 flex items-center justify-center min-h-[60px]">
                    <span className="text-sm text-text-t/50">—</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
