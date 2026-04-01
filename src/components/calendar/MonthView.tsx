import { useState } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  isSameDay,
} from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { BookingStatus } from '../../types';

const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const weekDaysFull = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const statusDot: Record<BookingStatus, string> = {
  Confirmed: 'bg-text-p',
  Tentative: 'bg-[#6B6560]',
  Completed: 'bg-[#3D8C5C]',
  Cancelled: 'bg-[#7A3535]',
  'No-show': 'bg-[#8A6A2A]',
};

export default function MonthView() {
  const calendarDate = useUIStore((s) => s.calendarDate);
  const setSelectedBookingId = useUIStore((s) => s.setSelectedBookingId);
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(calendarDate);
  const monthEnd = endOfMonth(calendarDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const getBookingsForDay = (day: Date) =>
    bookings
      .filter((b) => isSameDay(new Date(b.date), day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const selectedDayBookings = selectedDay ? getBookingsForDay(selectedDay) : [];

  return (
    <div className="flex-1 flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 px-3 lg:px-0">
        {weekDays.map((d, i) => (
          <div key={i} className="py-3 text-center">
            <span className="text-sm text-text-t font-medium lg:hidden">{d}</span>
            <span className="text-xs text-text-t font-medium hidden lg:inline uppercase tracking-wider">{weekDaysFull[i]}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1 px-3 lg:px-0 auto-rows-fr">
        {days.map((day) => {
          const dayBookings = getBookingsForDay(day);
          const inMonth = isSameMonth(day, calendarDate);
          const today = isToday(day);
          const isSelected = selectedDay && isSameDay(day, selectedDay);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={`relative flex flex-col items-center py-3 lg:py-1.5 lg:items-start lg:px-2 lg:min-h-[100px] border-b border-r border-border/30 transition-all cursor-pointer ${
                !inMonth ? 'opacity-30' : ''
              } ${isSelected ? 'bg-accent/5' : 'active:bg-elevated/40'} ${
                today ? 'bg-accent-glow' : ''
              }`}
            >
              {/* Date number */}
              <span
                className={`text-sm lg:text-xs w-9 h-9 lg:w-6 lg:h-6 flex items-center justify-center rounded-full mb-1.5 ${
                  today
                    ? 'bg-accent text-bg font-semibold'
                    : isSelected
                    ? 'text-accent font-medium'
                    : inMonth
                    ? 'text-text-s'
                    : 'text-text-t'
                }`}
              >
                {format(day, 'd')}
              </span>

              {/* Mobile: colored dots */}
              {dayBookings.length > 0 && (
                <div className="flex gap-1 lg:hidden">
                  {dayBookings.slice(0, 3).map((b) => (
                    <span key={b.id} className={`w-2 h-2 rounded-full ${statusDot[b.status]}`} />
                  ))}
                  {dayBookings.length > 3 && (
                    <span className="w-2 h-2 rounded-full bg-accent-dim" />
                  )}
                </div>
              )}

              {/* Desktop: booking text previews */}
              <div className="hidden lg:flex flex-col gap-0.5 w-full mt-1">
                {dayBookings.slice(0, 3).map((b) => {
                  const client = getClient(b.client_id ?? '');
                  return (
                    <div
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBookingId(b.id);
                      }}
                      className="text-xs px-1.5 py-0.5 rounded bg-elevated/60 truncate hover:bg-accent/10 hover:shadow-glow transition-all cursor-pointer"
                    >
                      <span className="text-text-t">{format(new Date(b.date), 'h:mma')}</span>{' '}
                      <span className="text-text-p">{client?.name.split(' ')[0]}</span>
                    </div>
                  );
                })}
                {dayBookings.length > 3 && (
                  <span className="text-xs text-accent-dim pl-1.5">+{dayBookings.length - 3} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Mobile: selected day booking list */}
      {selectedDay && (
        <div className="lg:hidden border-t border-border bg-surface/50 px-5 py-4">
          <div className="text-sm text-text-t uppercase tracking-wider mb-4 font-medium">
            {format(selectedDay, 'EEEE, MMM d')}
          </div>
          {selectedDayBookings.length > 0 ? (
            <div className="space-y-3">
              {selectedDayBookings.map((b) => {
                const client = getClient(b.client_id ?? '');
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBookingId(b.id)}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-xl bg-elevated/50 border border-border/40 cursor-pointer press-scale active:shadow-glow transition-all min-h-[56px]"
                  >
                    <span className={`w-3 h-3 rounded-full ${statusDot[b.status]} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-text-p font-medium truncate">
                        {client?.name ?? 'Walk-in'}
                      </div>
                      <div className="text-sm text-text-s mt-0.5">
                        {format(new Date(b.date), 'h:mm a')} &middot; {b.type} &middot; {b.duration}h
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-base text-text-t py-6 text-center">No bookings</div>
          )}
        </div>
      )}
    </div>
  );
}
