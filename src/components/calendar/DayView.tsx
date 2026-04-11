import { useRef, useCallback, useState, useEffect } from 'react';
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
import { useDrag, usePinch } from '@use-gesture/react';
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
const DEFAULT_HOUR_HEIGHT = 64;
const MIN_HOUR_HEIGHT = 32;
const MAX_HOUR_HEIGHT = 128;
const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.4;

// Full day panel: hour labels + grid lines + bookings
function DayPanel({
  day, bookings, getClient, onSlotClick, onBookingClick, hourHeight,
}: {
  day: Date;
  bookings: Booking[];
  getClient: (id: string) => { name: string; display_name?: string } | undefined;
  onSlotClick: (hour: number, day: Date) => void;
  onBookingClick: (id: string) => void;
  hourHeight: number;
}) {
  const dayBookings = bookings
    .filter((b) => isSameDay(new Date(b.date), day))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="shrink-0 relative" style={{ minHeight: hours.length * hourHeight, width: 'calc(100% / 3)' }}>
      {hours.map((hour) => {
        const isOffHours = hour < 8;
        return (
          <div
            key={hour}
            className={`absolute w-full border-b border-border/15 flex cursor-pointer transition-colors ${isOffHours ? 'bg-white/[0.015]' : ''}`}
            style={{ top: hour * hourHeight, height: hourHeight }}
            onClick={() => onSlotClick(hour, day)}
          >
            <div className={`w-16 text-xs py-2 text-right pr-4 shrink-0 ${isOffHours ? 'text-text-t/50' : 'text-text-t'}`}>
              {format(new Date(2026, 0, 1, hour), 'h a')}
            </div>
            <div className="flex-1 border-l border-border/20" />
          </div>
        );
      })}

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
  const hasScrolledToStart = useRef(false);

  const weekStripRef = useRef<HTMLDivElement>(null);
  const stripX = useMotionValue(0);
  const weekX = useMotionValue(0);
  const isAnimating = useRef(false);
  const isWeekAnimating = useRef(false);

  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const pinchStartHeight = useRef(DEFAULT_HOUR_HEIGHT);

  // pendingDate shows instantly in week strip while carousel animates
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const displayDate = pendingDate ?? calendarDate;

  const prevDay = subDays(calendarDate, 1);
  const nextDay = addDays(calendarDate, 1);
  const prevWeekDate = subWeeks(calendarDate, 1);
  const nextWeekDate = addWeeks(calendarDate, 1);

  // Scroll to 8am on first render
  useEffect(() => {
    if (!hasScrolledToStart.current && containerRef.current) {
      containerRef.current.scrollTop = 8 * hourHeight;
      hasScrolledToStart.current = true;
    }
  }, [hourHeight]);

  const handleSlotClick = useCallback((hour: number, day: Date) => {
    const dateStr = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0).toISOString();
    setPrefillBookingData({ date: dateStr });
    openBookingForm();
  }, [setPrefillBookingData, openBookingForm]);

  const handleBookingClick = useCallback((id: string) => {
    setSelectedBookingId(id);
  }, [setSelectedBookingId]);

  // Pinch-to-zoom: scale hour height
  usePinch(
    ({ first, event, movement: [scale], origin: [, oy] }) => {
      event?.preventDefault();
      if (first) {
        pinchStartHeight.current = hourHeight;
      }

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const pinchY = oy - containerRect.top + container.scrollTop;
      const hourAtCenter = pinchY / hourHeight;

      const newHeight = Math.round(
        Math.min(MAX_HOUR_HEIGHT, Math.max(MIN_HOUR_HEIGHT, pinchStartHeight.current * scale))
      );
      setHourHeight(newHeight);

      const newPinchY = hourAtCenter * newHeight;
      container.scrollTop = newPinchY - (oy - containerRect.top);
    },
    {
      pointer: { touch: true },
      scaleBounds: { min: MIN_HOUR_HEIGHT / DEFAULT_HOUR_HEIGHT, max: MAX_HOUR_HEIGHT / DEFAULT_HOUR_HEIGHT },
      eventOptions: { passive: false },
      target: containerRef,
    }
  );

  // Timeline carousel: horizontal swipe changes day
  const timelineBind = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], last }) => {
      if (isAnimating.current) return;
      stripX.set(mx);
      if (last) {
        if (Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD) {
          const dir = dx > 0 ? -1 : 1;
          const w = containerRef.current?.offsetWidth ?? 375;
          isAnimating.current = true;
          const newDate = dir === 1 ? addDays(calendarDate, 1) : subDays(calendarDate, 1);
          setPendingDate(newDate);
          animate(stripX, -dir * w, {
            type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
            onComplete: () => {
              setCalendarDate(newDate);
              setPendingDate(null);
              stripX.set(0);
              isAnimating.current = false;
            },
          });
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
      if (isWeekAnimating.current) return;
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
          const w = weekStripRef.current?.offsetWidth ?? 375;
          isWeekAnimating.current = true;
          const newDate = dir === 1 ? addWeeks(calendarDate, 1) : subWeeks(calendarDate, 1);
          setPendingDate(newDate);
          animate(weekX, -dir * w, {
            type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
            onComplete: () => {
              setCalendarDate(newDate);
              setPendingDate(null);
              weekX.set(0);
              isWeekAnimating.current = false;
            },
          });
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
          <span className="text-lg font-medium">{format(displayDate, 'MMMM')}</span>
        </button>
        <button
          onClick={() => openBookingForm()}
          className="w-12 h-12 bg-accent text-bg rounded-xl flex items-center justify-center cursor-pointer press-scale transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Week strip carousel */}
      <div ref={weekStripRef} className="shrink-0 border-b border-border/30 overflow-hidden touch-none">
        <div {...weekBind()}>
          <motion.div className="flex" style={{ x: weekX, width: '300%', marginLeft: '-100%' }}>
            <WeekRow baseDate={prevWeekDate} selectedDate={displayDate} onDayClick={setCalendarDate} />
            <WeekRow baseDate={calendarDate} selectedDate={displayDate} onDayClick={setCalendarDate} />
            <WeekRow baseDate={nextWeekDate} selectedDate={displayDate} onDayClick={setCalendarDate} />
          </motion.div>
        </div>
      </div>

      {/* Timeline carousel: full day panels slide together */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div {...timelineBind()} style={{ touchAction: 'pan-y' }}>
          <motion.div className="flex" style={{ x: stripX, width: '300%', marginLeft: '-100%' }}>
            <DayPanel day={prevDay} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} hourHeight={hourHeight} />
            <DayPanel day={calendarDate} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} hourHeight={hourHeight} />
            <DayPanel day={nextDay} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} hourHeight={hourHeight} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
