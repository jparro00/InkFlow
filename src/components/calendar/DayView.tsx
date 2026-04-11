import { useRef, useCallback, useEffect, useState } from 'react';
import {
  format,
  isSameDay,
  isSameWeek,
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
import { ChevronLeft, Plus, Search } from 'lucide-react';
import AppHeader from '../layout/AppHeader';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { Booking } from '../../types';
import { typeColor } from '../../types';


const hours = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 48;
const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.4;

// Full day panel: hour labels + grid lines + bookings
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

  // Compute side-by-side columns for overlapping bookings
  const layoutBookings = dayBookings.map((booking) => {
    const d = new Date(booking.date);
    const start = d.getHours() + d.getMinutes() / 60;
    const end = start + booking.duration;
    return { booking, start, end, column: 0, totalColumns: 1 };
  });

  // Assign columns: for each booking, find first column not occupied
  for (let i = 0; i < layoutBookings.length; i++) {
    const occupied = new Set<number>();
    for (let j = 0; j < i; j++) {
      if (layoutBookings[j].end > layoutBookings[i].start && layoutBookings[j].start < layoutBookings[i].end) {
        occupied.add(layoutBookings[j].column);
      }
    }
    let col = 0;
    while (occupied.has(col)) col++;
    layoutBookings[i].column = col;
  }

  // Set totalColumns for each overlap group
  for (let i = 0; i < layoutBookings.length; i++) {
    let maxCol = layoutBookings[i].column;
    for (let j = 0; j < layoutBookings.length; j++) {
      if (i !== j && layoutBookings[j].end > layoutBookings[i].start && layoutBookings[j].start < layoutBookings[i].end) {
        maxCol = Math.max(maxCol, layoutBookings[j].column);
      }
    }
    layoutBookings[i].totalColumns = maxCol + 1;
  }

  return (
    <div className="shrink-0 relative" style={{ minHeight: hours.length * HOUR_HEIGHT, width: 'calc(100% / 3)' }}>
      {hours.map((hour) => {
        const isOffHours = hour < 8;
        return (
          <div
            key={hour}
            className={`absolute w-full flex cursor-pointer transition-colors ${isOffHours ? 'bg-white/[0.015]' : ''}`}
            style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            onClick={() => onSlotClick(hour, day)}
          >
            <div className={`w-16 text-base text-right pr-4 shrink-0 ${isOffHours ? 'text-text-t/50' : 'text-text-t'}`} style={{ marginTop: -8 }}>
              {hour > 0 ? format(new Date(2026, 0, 1, hour), 'h a') : ''}
            </div>
            <div className="flex-1 border-t border-border/15" />
          </div>
        );
      })}

      {/* Current time indicator — red line with badge */}
      {isToday(day) && (() => {
        const now = new Date();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        const top = currentHour * HOUR_HEIGHT;
        return (
          <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top, transform: 'translateY(-50%)' }}>
            <div className="shrink-0 flex justify-end" style={{ width: 64 }}>
              <span className="text-base text-white font-medium bg-today rounded-md px-3 py-0.5">
                {format(now, 'h:mm')}
              </span>
            </div>
            <div className="flex-1 h-[2px] bg-today" />
          </div>
        );
      })()}

      {layoutBookings.map(({ booking, column, totalColumns }) => {
        const d = new Date(booking.date);
        const startHour = d.getHours() + d.getMinutes() / 60;
        const top = startHour * HOUR_HEIGHT;
        const height = booking.duration * HOUR_HEIGHT;
        const client = getClient(booking.client_id ?? '');
        const leftPct = (column / totalColumns) * 100;
        const widthPct = 100 / totalColumns;
        return (
          <button
            key={booking.id}
            className="absolute rounded-[4px] pt-1.5 px-2 pb-1 border border-border/30 cursor-pointer press-scale transition-all active:shadow-glow text-left overflow-hidden flex flex-col justify-start"
            style={{
              top,
              height: Math.max(height, 48),
              left: `calc(64px + (100% - 68px) * ${leftPct / 100})`,
              width: `calc((100% - 68px) * ${widthPct / 100})`,
              borderLeftWidth: 3,
              borderLeftColor: booking.rescheduled ? '#CF6679' : typeColor[booking.type],
              backgroundColor: `${typeColor[booking.type]}12`,
            }}
            onClick={(e) => { e.stopPropagation(); onBookingClick(booking.id); }}
          >
            <div className="text-md text-text-p font-medium truncate">
              {client?.display_name || client?.name || 'Walk-in'}
            </div>
            <div className="text-base text-text-s mt-0.5 truncate">
              {format(d, 'h:mm a')} · {booking.duration}h
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Single week strip row
function WeekRow({ baseDate, selectedDate, onDayClick, bookings }: {
  baseDate: Date;
  selectedDate: Date;
  onDayClick: (day: Date) => void;
  bookings: Booking[];
}) {
  const ws = startOfWeek(baseDate, { weekStartsOn: 0 });
  const we = endOfWeek(baseDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: ws, end: we });

  return (
    <div className="shrink-0 grid grid-cols-7 px-3 py-1" style={{ width: 'calc(100% / 3)' }}>
      {days.map((day) => {
        const today = isToday(day);
        const selected = isSameDay(day, selectedDate);
        const hasBookings = bookings.some((b) => isSameDay(new Date(b.date), day));
        return (
          <button
            key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className="flex flex-col items-center gap-0.5 py-0.5 cursor-pointer transition-colors"
          >
            <span
              className={`w-10 h-10 flex items-center justify-center rounded-full text-md font-medium transition-colors ${
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
            <span className={`w-1.5 h-1.5 rounded-full ${hasBookings ? (selected ? 'bg-accent' : 'bg-text-t') : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}

export default function DayView() {
  const { calendarDate, setCalendarDate, setCalendarView, openBookingForm, setSelectedBookingId, setPrefillBookingData, setTodayHandler, setCalendarSearchOpen } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToStart = useRef(false);

  const weekStripRef = useRef<HTMLDivElement>(null);
  const stripX = useMotionValue(0);
  const weekX = useMotionValue(0);
  const stripAnim = useRef<ReturnType<typeof animate> | null>(null);
  const stripPendingDate = useRef<Date | null>(null);
  const weekAnim = useRef<ReturnType<typeof animate> | null>(null);
  const weekPendingDate = useRef<Date | null>(null);

  // Override allows Today button to put today in an adjacent panel slot
  const [panelOverride, setPanelOverride] = useState<{ day: Date; dir: 1 | -1 } | null>(null);

  const prevDay = panelOverride?.dir === -1 ? panelOverride.day : subDays(calendarDate, 1);
  const nextDay = panelOverride?.dir === 1 ? panelOverride.day : addDays(calendarDate, 1);
  const prevWeekDate = panelOverride?.dir === -1 ? panelOverride.day : subWeeks(calendarDate, 1);
  const nextWeekDate = panelOverride?.dir === 1 ? panelOverride.day : addWeeks(calendarDate, 1);

  const scrollToNow = useCallback(() => {
    if (!containerRef.current) return;
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const targetScroll = currentHour * HOUR_HEIGHT - containerRef.current.offsetHeight / 2;
    containerRef.current.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, []);

  // Scroll to current time (or 8am if not today) on first render
  useEffect(() => {
    if (!hasScrolledToStart.current && containerRef.current) {
      if (isToday(calendarDate)) {
        const now = new Date();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        containerRef.current.scrollTop = Math.max(0, currentHour * HOUR_HEIGHT - containerRef.current.offsetHeight / 2);
      } else {
        containerRef.current.scrollTop = 8 * HOUR_HEIGHT;
      }
      hasScrolledToStart.current = true;
    }
  }, []);

  const handleSlotClick = useCallback((hour: number, day: Date) => {
    const dateStr = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0).toISOString();
    setPrefillBookingData({ date: dateStr });
    openBookingForm();
  }, [setPrefillBookingData, openBookingForm]);

  const handleBookingClick = useCallback((id: string) => {
    setSelectedBookingId(id);
  }, [setSelectedBookingId]);

  // Register Today handler for shared button
  useEffect(() => {
    const handler = () => {
      const today = new Date();
      if (isSameDay(calendarDate, today)) {
        scrollToNow();
        return;
      }

      const dir: 1 | -1 = today > calendarDate ? 1 : -1;
      const w = containerRef.current?.offsetWidth ?? 375;
      const sameWeek = isSameWeek(calendarDate, today, { weekStartsOn: 0 });

      setPanelOverride({ day: today, dir });

      requestAnimationFrame(() => {
        stripAnim.current?.stop();
        stripAnim.current = animate(stripX, -dir * w, {
          type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
          onComplete: () => {
            stripX.jump(0);
            setPanelOverride(null);
            setCalendarDate(today);
            stripAnim.current = null;
            requestAnimationFrame(() => scrollToNow());
          },
        });

        if (!sameWeek) {
          const weekW = weekStripRef.current?.offsetWidth ?? 375;
          weekAnim.current?.stop();
          weekAnim.current = animate(weekX, -dir * weekW, {
            type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
            onComplete: () => {
              weekX.jump(0);
              weekAnim.current = null;
            },
          });
        }
      });
    };
    setTodayHandler(handler);
    return () => setTodayHandler(null);
  }, [calendarDate, scrollToNow, setCalendarDate, setTodayHandler, stripX, weekX]);

  // Timeline carousel: horizontal swipe changes day
  const timelineBind = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], first, last }) => {
      if (first) {
        // If mid-animation, commit the pending date so next swipe starts from correct day
        if (stripAnim.current && stripPendingDate.current) {
          stripAnim.current.stop();
          setCalendarDate(stripPendingDate.current);
          stripPendingDate.current = null;
          stripAnim.current = null;
        }
        stripX.set(0);
      }
      stripX.set(mx);
      if (last) {
        if (Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD) {
          const dir = dx > 0 ? -1 : 1;
          const w = containerRef.current?.offsetWidth ?? 375;
          const newDate = dir === 1 ? addDays(calendarDate, 1) : subDays(calendarDate, 1);
          stripPendingDate.current = newDate;
          stripAnim.current = animate(stripX, -dir * w, {
            type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
            onComplete: () => {
              setCalendarDate(newDate);
              stripX.set(0);
              stripAnim.current = null;
              stripPendingDate.current = null;
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
    ({ movement: [mx, my], velocity: [vx, vy], direction: [, dy], first, last, swipe: [, sy], axis }) => {
      if (axis === 'y') {
        if (last && (sy === -1 || (my < -30 && Math.abs(my) > Math.abs(mx) && (Math.abs(my) > 40 || vy > 0.3) && dy < 0))) {
          setCalendarView('month');
        }
        return;
      }
      if (first) {
        if (weekAnim.current && weekPendingDate.current) {
          weekAnim.current.stop();
          setCalendarDate(weekPendingDate.current);
          weekPendingDate.current = null;
          weekAnim.current = null;
        }
        weekX.set(0);
      }
      weekX.set(mx);
      if (last) {
        if (Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD) {
          const dir = mx < 0 ? 1 : -1;
          const w = weekStripRef.current?.offsetWidth ?? 375;
          const newDate = dir === 1 ? addWeeks(calendarDate, 1) : subWeeks(calendarDate, 1);
          weekPendingDate.current = newDate;
          weekAnim.current = animate(weekX, -dir * w, {
            type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
            onComplete: () => {
              setCalendarDate(newDate);
              weekX.set(0);
              weekAnim.current = null;
              weekPendingDate.current = null;
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
      <AppHeader
        left={
          <button
            onClick={() => setCalendarView('month')}
            className="flex items-center gap-1 text-text-p active:opacity-70 transition-opacity cursor-pointer press-scale min-h-[44px]"
          >
            <ChevronLeft size={20} />
            <span className="text-[22px] font-medium">{format(calendarDate, 'MMMM')}</span>
          </button>
        }
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCalendarSearchOpen(true)}
              className="w-12 h-12 bg-surface border border-border/40 text-text-s rounded-md flex items-center justify-center cursor-pointer press-scale transition-transform"
            >
              <Search size={20} />
            </button>
            <button
              onClick={() => {
                setPrefillBookingData({ date: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate(), 10, 0).toISOString() });
                openBookingForm();
              }}
              className="w-12 h-12 bg-accent text-bg rounded-md flex items-center justify-center cursor-pointer press-scale transition-transform shadow-glow active:shadow-glow-strong"
            >
              <Plus size={20} />
            </button>
          </div>
        }
      />

      {/* Fixed day headers — shared with month view */}
      <div className="grid grid-cols-7 px-3 shrink-0">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="py-2 text-center text-md text-text-t font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Week strip carousel */}
      <div ref={weekStripRef} className="shrink-0 border-b border-border/30 overflow-hidden touch-none">
        <div {...weekBind()}>
          <motion.div className="flex" style={{ x: weekX, width: '300%', marginLeft: '-100%' }}>
            <WeekRow baseDate={prevWeekDate} selectedDate={calendarDate} onDayClick={setCalendarDate} bookings={bookings} />
            <WeekRow baseDate={calendarDate} selectedDate={calendarDate} onDayClick={setCalendarDate} bookings={bookings} />
            <WeekRow baseDate={nextWeekDate} selectedDate={calendarDate} onDayClick={setCalendarDate} bookings={bookings} />
          </motion.div>
        </div>
      </div>

      {/* Timeline carousel: full day panels slide together */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
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
