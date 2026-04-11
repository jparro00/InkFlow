import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
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
import { ChevronLeft, Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { Booking } from '../../types';
import { typeColor } from '../../types';


const hours = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 48;
const SCROLL_SETTLE_MS = 120;

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

  return (
    <div className="shrink-0 relative" style={{ minHeight: hours.length * HOUR_HEIGHT, width: '100%' }}>
      {hours.map((hour) => {
        const isOffHours = hour < 8;
        return (
          <div
            key={hour}
            className={`absolute w-full flex cursor-pointer transition-colors ${isOffHours ? 'bg-white/[0.015]' : ''}`}
            style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            onClick={() => onSlotClick(hour, day)}
          >
            <div className={`w-16 text-xs text-right pr-4 shrink-0 ${isOffHours ? 'text-text-t/50' : 'text-text-t'}`} style={{ marginTop: -7 }}>
              {hour > 0 ? format(new Date(2026, 0, 1, hour), 'h a') : ''}
            </div>
            <div className="flex-1 border-t border-border/15" />
          </div>
        );
      })}

      {dayBookings.map((booking) => {
        const d = new Date(booking.date);
        const startHour = d.getHours() + d.getMinutes() / 60;
        const top = startHour * HOUR_HEIGHT;
        const height = booking.duration * HOUR_HEIGHT;
        const client = getClient(booking.client_id ?? '');
        return (
          <button
            key={booking.id}
            className="absolute left-16 right-1 rounded-[4px] pt-1.5 px-3 pb-1 border border-border/30 cursor-pointer press-scale transition-all active:shadow-glow text-left overflow-hidden flex flex-col justify-start"
            style={{ top, height: Math.max(height, 48), borderLeftWidth: 3, borderLeftColor: typeColor[booking.type], backgroundColor: `${typeColor[booking.type]}12` }}
            onClick={(e) => { e.stopPropagation(); onBookingClick(booking.id); }}
          >
            <div className="text-base text-text-p font-medium truncate">
              {client?.display_name || client?.name || 'Walk-in'}
            </div>
            <div className="text-sm text-text-s mt-0.5">
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
    <div className="shrink-0 grid grid-cols-7 px-6 py-2 w-full">
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

// Hook: scroll-snap carousel that cycles prev/center/next panels.
// onSnap is called with direction; the hook handles resetting scroll
// position and preserving vertical scroll of the snapped panel.
function useSnapCarousel(
  onSnap: (direction: -1 | 1) => void,
  preserveVerticalScroll = false,
) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isResetting = useRef(false);

  const resetToCenter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    isResetting.current = true;
    el.scrollLeft = el.offsetWidth;
    requestAnimationFrame(() => { isResetting.current = false; });
  }, []);

  // Initialize scroll to center panel
  useLayoutEffect(() => {
    resetToCenter();
  }, [resetToCenter]);

  // Debounced scroll-end detection (works on all browsers, including Safari <18)
  const handleScroll = useCallback(() => {
    if (isResetting.current) return;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el || isResetting.current) return;
      const panelWidth = el.offsetWidth;
      const index = Math.round(el.scrollLeft / panelWidth);

      if (index === 0 || index === 2) {
        const direction: -1 | 1 = index === 0 ? -1 : 1;

        // Save vertical scroll of the panel user swiped to
        let savedScrollTop = 0;
        if (preserveVerticalScroll) {
          const panel = el.children[index] as HTMLElement | undefined;
          if (panel) savedScrollTop = panel.scrollTop;
        }

        onSnap(direction);

        // Reset to center after React processes the state update
        requestAnimationFrame(() => {
          resetToCenter();
          if (preserveVerticalScroll && savedScrollTop > 0) {
            const center = el.children?.[1] as HTMLElement | undefined;
            if (center) center.scrollTop = savedScrollTop;
          }
        });
      }
    }, SCROLL_SETTLE_MS);
  }, [onSnap, preserveVerticalScroll, resetToCenter]);

  useEffect(() => {
    return () => clearTimeout(scrollTimer.current);
  }, []);

  return { ref, handleScroll, resetToCenter };
}

export default function DayView() {
  const { calendarDate, setCalendarDate, setCalendarView, openBookingForm, setSelectedBookingId, setPrefillBookingData } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const prevDay = subDays(calendarDate, 1);
  const nextDay = addDays(calendarDate, 1);
  const prevWeekDate = subWeeks(calendarDate, 1);
  const nextWeekDate = addWeeks(calendarDate, 1);

  // --- Timeline scroll-snap carousel ---
  const centerPanelRef = useRef<HTMLDivElement>(null);
  const hasScrolledTo8am = useRef(false);

  const handleTimelineSnap = useCallback((direction: -1 | 1) => {
    const newDate = direction === 1 ? addDays(calendarDate, 1) : subDays(calendarDate, 1);
    setCalendarDate(newDate);
  }, [calendarDate, setCalendarDate]);

  const timelineCarousel = useSnapCarousel(handleTimelineSnap, true);

  // Scroll center panel to 8am on first render
  useEffect(() => {
    if (!hasScrolledTo8am.current && centerPanelRef.current) {
      centerPanelRef.current.scrollTop = 8 * HOUR_HEIGHT;
      hasScrolledTo8am.current = true;
    }
  }, []);

  // --- Week strip scroll-snap carousel ---
  const handleWeekSnap = useCallback((direction: -1 | 1) => {
    const newDate = direction === 1 ? addWeeks(calendarDate, 1) : subWeeks(calendarDate, 1);
    setCalendarDate(newDate);
  }, [calendarDate, setCalendarDate]);

  const weekCarousel = useSnapCarousel(handleWeekSnap);

  // Swipe-up on week strip → go to month view
  const weekTouchStart = useRef<{ x: number; y: number } | null>(null);
  const handleWeekTouchStart = useCallback((e: React.TouchEvent) => {
    weekTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleWeekTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!weekTouchStart.current) return;
    const dx = e.changedTouches[0].clientX - weekTouchStart.current.x;
    const dy = e.changedTouches[0].clientY - weekTouchStart.current.y;
    weekTouchStart.current = null;
    // Predominantly upward swipe
    if (dy < -40 && Math.abs(dy) > Math.abs(dx)) {
      setCalendarView('month');
    }
  }, [setCalendarView]);

  const handleSlotClick = useCallback((hour: number, day: Date) => {
    const dateStr = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0).toISOString();
    setPrefillBookingData({ date: dateStr });
    openBookingForm();
  }, [setPrefillBookingData, openBookingForm]);

  const handleBookingClick = useCallback((id: string) => {
    setSelectedBookingId(id);
  }, [setSelectedBookingId]);

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

      {/* Week strip — scroll-snap carousel with swipe-up detection */}
      <div
        ref={weekCarousel.ref}
        className="shrink-0 border-b border-border/30 overflow-x-auto snap-x snap-mandatory flex"
        style={{ scrollbarWidth: 'none' }}
        onScroll={weekCarousel.handleScroll}
        onTouchStart={handleWeekTouchStart}
        onTouchEnd={handleWeekTouchEnd}
      >
        <div className="snap-start shrink-0 w-full">
          <WeekRow baseDate={prevWeekDate} selectedDate={calendarDate} onDayClick={setCalendarDate} />
        </div>
        <div className="snap-start shrink-0 w-full">
          <WeekRow baseDate={calendarDate} selectedDate={calendarDate} onDayClick={setCalendarDate} />
        </div>
        <div className="snap-start shrink-0 w-full">
          <WeekRow baseDate={nextWeekDate} selectedDate={calendarDate} onDayClick={setCalendarDate} />
        </div>
      </div>

      {/* Timeline — scroll-snap carousel, each panel scrolls vertically */}
      <div
        ref={timelineCarousel.ref}
        className="flex-1 overflow-x-auto snap-x snap-mandatory flex overflow-y-hidden"
        style={{ scrollbarWidth: 'none' }}
        onScroll={timelineCarousel.handleScroll}
      >
        <div className="snap-start shrink-0 w-full h-full overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <DayPanel day={prevDay} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} />
        </div>
        <div ref={centerPanelRef} className="snap-start shrink-0 w-full h-full overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <DayPanel day={calendarDate} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} />
        </div>
        <div className="snap-start shrink-0 w-full h-full overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          <DayPanel day={nextDay} bookings={bookings} getClient={getClient} onSlotClick={handleSlotClick} onBookingClick={handleBookingClick} />
        </div>
      </div>
    </div>
  );
}
