import { useRef, useCallback } from 'react';
import {
  format,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
} from 'date-fns';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { ChevronLeft, Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { Booking, BookingStatus } from '../../types';

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
const HOUR_HEIGHT = 64;
const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.4;

// Full day panel: hour labels + grid lines + bookings (everything slides together)
function DayPanel({
  day, bookings, getClient, onSlotClick, onBookingClick,
}: {
  day: Date;
  bookings: Booking[];
  getClient: (id: string) => { name: string; display_name?: string } | undefined;
  onSlotClick: (hour: number, day: Date) => void;
  onBookingClick: (id: string) => void;
}) {
  const dayBookings = bookings
    .filter((b) => isSameDay(new Date(b.date), day))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="shrink-0 relative" style={{ minHeight: hours.length * HOUR_HEIGHT, width: 'calc(100% / 3)' }}>
      {/* Hour labels + grid lines */}
      {hours.map((hour) => {
        const isOffHours = hour < 8;
        return (
          <div
            key={hour}
            className={`absolute w-full border-b border-border/15 flex cursor-pointer transition-colors ${isOffHours ? 'bg-white/[0.015]' : ''}`}
            style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            onClick={() => onSlotClick(hour, day)}
          >
            <div className={`w-16 text-xs py-2 text-right pr-4 shrink-0 ${isOffHours ? 'text-text-t/50' : 'text-text-t'}`}>
              {format(new Date(2026, 0, 1, hour), 'h a')}
            </div>
            <div className="flex-1 border-l border-border/20" />
          </div>
        );
      })}

      {/* Booking blocks */}
      {dayBookings.map((booking) => {
        const d = new Date(booking.date);
        const startHour = d.getHours() + d.getMinutes() / 60;
        const top = startHour * HOUR_HEIGHT;
        const height = booking.duration * HOUR_HEIGHT;
        const client = getClient(booking.client_id ?? '');
        return (
          <button
            key={booking.id}
            className={`absolute left-16 right-6 rounded-xl p-4 ${statusBg[booking.status]} border border-border/30 cursor-pointer press-scale transition-all active:shadow-glow text-left`}
            style={{ top, height: Math.max(height, 48) }}
            onClick={(e) => { e.stopPropagation(); onBookingClick(booking.id); }}
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
  );
}

// Single week strip row
function WeekRow({ baseDate, selectedDate, onDayClick }: {
  baseDate: Date;
  selectedDate: Date;
  onDayClick: (day: Date) => void;
}) {
  const ws = startOfWeek(baseDate, { weekStartsOn: 0 });
  const we = endOfWeek(baseDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: ws, end: we });

  return (
    <div className="shrink-0 grid grid-cols-7 px-6 py-2" style={{ width: 'calc(100% / 3)' }}>
      {days.map((day) => {
        const today = isToday(day);
        const selected = isSameDay(day, selectedDate);
        return (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className="flex flex-col items-center gap-1 py-1 cursor-pointer transition-colors"
          >
            <span className={`text-xs font-medium ${today && !selected ? 'text-today' : 'text-text-t'}`}>
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
  );
}

export default function DayView() {
  const { calendarDate, setCalendarDate, setCalendarView, openBookingForm, setSelectedBookingId, setPrefillBookingData } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const containerRef = useRef<HTMLDivElement>(null);
  const stripX = useMotionValue(0);
  const weekX = useMotionValue(0);

  const prevDay = subDays(calendarDate, 1);
  const nextDay = addDays(calendarDate, 1);
  const prevWeekDate = subWeeks(calendarDate, 1);
  const nextWeekDate = addWeeks(calendarDate, 1);

  const handleSlotClick = useCallback((hour: number, day: Date) => {
    const dateStr = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0).toISOString();
    setPrefillBookingData({ date: dateStr });
    openBookingForm();
  }, [setPrefillBookingData, openBookingForm]);

  const handleBookingClick = useCallback((id: string) => {
    setSelectedBookingId(id);
  }, [setSelectedBookingId]);

  // Timeline carousel: horizontal swipe changes day
  const timelineBind = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], last }) => {
      stripX.set(mx);
      if (last) {
        if (Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD) {
          const dir = dx > 0 ? -1 : 1;
          setCalendarDate(dir === 1 ? addDays(calendarDate, 1) : subDays(calendarDate, 1));
          stripX.set(0);
        } else {
          animate(stripX, 0, { type: 'spring', stiffness: 400, damping: 30 });
        }
      }
    },
    { axis: 'x', filterTaps: true, threshold: 10, pointer: { touch: true } }
  );

  // Week strip carousel
  const weekBind = useDrag(
    ({ movement: [mx, my], velocity: [vx, vy], direction: [, dy], last, swipe: [, sy], axis }) => {
      if (axis === 'y') {
        if (last && (sy === -1 || (my < -30 && Math.abs(my) > Math.abs(mx) && (Math.abs(my) > 40 || vy > 0.3) && dy < 0))) {
          setCalendarView('month');
        }
        return;
      }
      weekX.set(mx);
      if (last) {
        if (Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD) {
          const dir = mx < 0 ? 1 : -1;
          setCalendarDate(dir === 1 ? addWeeks(calendarDate, 1) : subWeeks(calendarDate, 1));
          weekX.set(0);
        } else {
          animate(weekX, 0, { type: 'spring', stiffness: 400, damping: 30 });
        }
      }
    },
    { filterTaps: true, threshold: 8, pointer: { touch: true }, axis: 'lock' }
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-2 flex items-center justify-between shrink-0">
        <button
          onClick={() => setCalendarView('month')}
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

      {/* Week strip carousel */}
      <div className="shrink-0 border-b border-border/30 overflow-hidden touch-none">
        <div {...weekBind()}>
          <motion.div className="flex" style={{ x: weekX, width: '300%', marginLeft: '-100%' }}>
            <WeekRow baseDate={prevWeekDate} selectedDate={calendarDate} onDayClick={setCalendarDate} />
            <WeekRow baseDate={calendarDate} selectedDate={calendarDate} onDayClick={setCalendarDate} />
            <WeekRow baseDate={nextWeekDate} selectedDate={calendarDate} onDayClick={setCalendarDate} />
          </motion.div>
        </div>
      </div>

      {/* Timeline carousel: full day panels slide together */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div {...timelineBind()} style={{ touchAction: 'pan-y' }}>
          <motion.div className="flex" style={{ x: stripX, width: '300%', marginLeft: '-100%' }}>
            <DayPanel day={prevDay} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} />
            <DayPanel day={calendarDate} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} />
            <DayPanel day={nextDay} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
