import { useRef, useState } from 'react';
import {
  format,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  subDays,
} from 'date-fns';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
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

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.4;

export default function DayView() {
  const { calendarDate, setCalendarDate, setCalendarView, openBookingForm, setSelectedBookingId, setPrefillBookingData } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const [slideDir, setSlideDir] = useState(0);
  const dragX = useMotionValue(0);
  const dragOpacity = useTransform(dragX, [-200, 0, 200], [0.5, 1, 0.5]);
  const swipeCommitted = useRef(false);

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

  const changeDay = (dir: -1 | 1) => {
    setSlideDir(dir);
    setCalendarDate(dir === 1 ? addDays(calendarDate, 1) : subDays(calendarDate, 1));
    setTimeout(() => setSlideDir(0), 300);
  };

  // Timeline: horizontal swipe to change day
  // touch-action is set to 'pan-y pinch-zoom' so browser handles vertical scroll
  // but we intercept horizontal movement manually
  const timelineBind = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], cancel, first, last, memo }) => {
      if (first) {
        swipeCommitted.current = false;
        return memo;
      }

      if (swipeCommitted.current) return memo;

      dragX.set(mx);

      if (Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD) {
        swipeCommitted.current = true;
        cancel();
        animate(dragX, 0, { duration: 0 });
        changeDay(dx > 0 ? -1 : 1);
        return memo;
      }

      if (last && !swipeCommitted.current) {
        animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 30 });
      }

      return memo;
    },
    {
      axis: 'x',
      filterTaps: true,
      threshold: 15,
      pointer: { touch: true },
      // Let browser handle vertical scroll, we only take horizontal
      eventOptions: { passive: false },
    }
  );

  // Week strip: swipe up for month view, left/right for day change
  const weekBind = useDrag(
    ({ movement: [mx, my], velocity: [vx, vy], direction: [, dy], last, swipe: [sx, sy] }) => {
      if (!last) return;

      // Quick swipe detection (use-gesture built-in)
      if (sy === -1) {
        setCalendarView('month');
        return;
      }
      if (sx !== 0) {
        changeDay(sx > 0 ? -1 : 1);
        return;
      }

      // Fallback: manual threshold check
      if (my < -30 && Math.abs(my) > Math.abs(mx) && (Math.abs(my) > 40 || vy > 0.3)) {
        if (dy < 0) {
          setCalendarView('month');
          return;
        }
      }
      if (Math.abs(mx) > Math.abs(my) && (Math.abs(mx) > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD)) {
        changeDay(mx < 0 ? 1 : -1);
      }
    },
    {
      filterTaps: true,
      threshold: 8,
      pointer: { touch: true },
      swipe: { distance: 30, velocity: 0.3 },
    }
  );

  const dateKey = format(calendarDate, 'yyyy-MM-dd');

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

      {/* Week strip — swipe up for month, left/right for day */}
      <div
        {...weekBind()}
        className="grid grid-cols-7 px-6 py-2 border-b border-border/30 shrink-0 touch-none"
      >
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

      {/* Timeline — swipe left/right to change day, vertical scroll preserved */}
      <div className="flex-1 overflow-y-auto">
        <div {...timelineBind()}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={dateKey}
              initial={slideDir !== 0 ? { x: slideDir > 0 ? '100%' : '-100%', opacity: 0 } : false}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: slideDir > 0 ? '-100%' : '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 400, mass: 0.7 }}
              className="relative"
              style={{ minHeight: hours.length * hourHeight, x: dragX, opacity: dragOpacity }}
            >
              {/* Hour grid */}
              {hours.map((hour) => {
                const isOffHours = hour < 8;
                return (
                  <div
                    key={hour}
                    className={`absolute w-full border-b border-border/15 flex active:bg-elevated/20 cursor-pointer transition-colors ${
                      isOffHours ? 'bg-white/[0.015]' : ''
                    }`}
                    style={{ top: hour * hourHeight, height: hourHeight }}
                    onClick={() => handleSlotClick(hour)}
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
