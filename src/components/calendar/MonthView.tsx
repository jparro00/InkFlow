import { useEffect, useRef, useCallback, useState } from 'react';
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
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, Plus, Search } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { typeColor } from '../../types';

const MONTHS_BUFFER = 6;

function getMonthRange(center: Date, buffer: number) {
  const months: Date[] = [];
  for (let i = -buffer; i <= buffer; i++) {
    months.push(addMonths(center, i));
  }
  return months;
}

export default function MonthView() {
  const { calendarDate, setCalendarDate, setCalendarView, openBookingForm, setTodayHandler, setCalendarSearchOpen } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const [months, setMonths] = useState(() => getMonthRange(calendarDate, MONTHS_BUFFER));
  const [visibleYear, setVisibleYear] = useState(calendarDate.getFullYear());
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentMonthRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll to current month on mount
  useEffect(() => {
    if (!hasScrolled.current && currentMonthRef.current) {
      currentMonthRef.current.scrollIntoView({ block: 'start' });
      hasScrolled.current = true;
    }
  }, [months]);

  // Infinite scroll with IntersectionObserver
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (entry.target === topSentinelRef.current) {
          setMonths((prev) => {
            const earliest = prev[0];
            const newMonths: Date[] = [];
            for (let i = MONTHS_BUFFER; i >= 1; i--) {
              newMonths.push(subMonths(earliest, i));
            }
            return [...newMonths, ...prev];
          });
        } else if (entry.target === bottomSentinelRef.current) {
          setMonths((prev) => {
            const latest = prev[prev.length - 1];
            const newMonths: Date[] = [];
            for (let i = 1; i <= MONTHS_BUFFER; i++) {
              newMonths.push(addMonths(latest, i));
            }
            return [...prev, ...newMonths];
          });
        }
      }
    },
    []
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, {
      root: scrollRef.current,
      rootMargin: '200px',
    });
    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);
    return () => observer.disconnect();
  }, [handleIntersect]);

  // Track which year is visible at top of scroll area
  useEffect(() => {
    const yearObserver = new IntersectionObserver(
      (entries) => {
        let topEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
              topEntry = entry;
            }
          }
        }
        if (topEntry) {
          const key = (topEntry.target as HTMLElement).dataset.month;
          if (key) setVisibleYear(parseInt(key.split('-')[0]));
        }
      },
      { root: scrollRef.current, rootMargin: '0px 0px -90% 0px', threshold: 0 }
    );
    monthRefs.current.forEach((el) => yearObserver.observe(el));
    return () => yearObserver.disconnect();
  }, [months]);

  // Register Today handler: if current month visible → open day view on today, else scroll to current month
  useEffect(() => {
    const handler = () => {
      const today = new Date();
      const todayKey = format(today, 'yyyy-MM');
      const todayEl = monthRefs.current.get(todayKey);

      if (todayEl && scrollRef.current) {
        const container = scrollRef.current;
        const elRect = todayEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isVisible = elRect.top < containerRect.bottom && elRect.bottom > containerRect.top;

        if (isVisible) {
          // Current month is visible — go to day view on today
          setCalendarDate(today);
          setCalendarView('day');
        } else {
          // Scroll to current month
          todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        // Current month not in DOM yet — set date and let it load
        setCalendarDate(today);
      }
    };
    setTodayHandler(handler);
    return () => setTodayHandler(null);
  }, [setCalendarDate, setCalendarView, setTodayHandler]);

  const getBookingsForDay = (day: Date) =>
    bookings
      .filter((b) => isSameDay(new Date(b.date), day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleDayClick = (day: Date) => {
    setCalendarDate(day);
    setCalendarView('day');
  };

  const isCurrentMonth = (month: Date) =>
    month.getFullYear() === calendarDate.getFullYear() &&
    month.getMonth() === calendarDate.getMonth();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-4 pb-2 flex items-center shrink-0 relative">
        <button
          onClick={() => setCalendarView('year')}
          className="flex items-center gap-1 text-text-p active:opacity-70 transition-opacity cursor-pointer press-scale min-h-[44px]"
        >
          <ChevronLeft size={20} />
          <span className="text-[22px] font-medium">{visibleYear}</span>
        </button>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative flex items-center">
            <img src={`${import.meta.env.BASE_URL}inkflow_logo.png`} alt="InkFlow" className="w-7 h-7 absolute -left-9" />
            <span className="font-display text-lg font-bold text-text-p tracking-wide">Keeps Ink</span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setCalendarSearchOpen(true)}
            className="w-12 h-12 bg-surface border border-border/40 text-text-s rounded-md flex items-center justify-center cursor-pointer press-scale transition-transform"
          >
            <Search size={20} />
          </button>
          <button
            onClick={() => openBookingForm()}
            className="w-12 h-12 bg-accent text-bg rounded-md flex items-center justify-center cursor-pointer press-scale transition-transform shadow-glow active:shadow-glow-strong"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Fixed day headers */}
      <div className="grid grid-cols-7 px-3 shrink-0">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="py-2 text-center text-md text-text-t font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable months */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-4">
        <div ref={topSentinelRef} className="h-1" />

        {months.map((month) => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
          const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
          const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
          const isCurrent = isCurrentMonth(month);

          return (
            <div
              key={format(month, 'yyyy-MM')}
              ref={(el) => {
                const key = format(month, 'yyyy-MM');
                if (el) monthRefs.current.set(key, el);
                else monthRefs.current.delete(key);
                if (isCurrent && el) (currentMonthRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }}
              data-month={format(month, 'yyyy-MM')}
              className="mb-1"
            >
              {/* Month name */}
              <h2 className="font-display text-2xl text-text-p pt-3 pb-2">
                {format(month, 'MMMM')}
              </h2>

              {/* Day grid */}
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const inMonth = isSameMonth(day, month);
                  const today = isToday(day);
                  const dayBookings = inMonth ? getBookingsForDay(day) : [];

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => inMonth && handleDayClick(day)}
                      disabled={!inMonth}
                      className={`flex flex-col items-start px-0.5 py-0.5 min-h-[64px] border-b border-border/15 transition-colors ${
                        inMonth ? 'cursor-pointer active:bg-elevated/30' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      {/* Date number */}
                      <div className="w-full flex justify-center mb-1">
                        <span
                          className={`w-9 h-9 flex items-center justify-center rounded-full text-md ${
                            today
                              ? 'bg-today text-white font-semibold'
                              : inMonth
                              ? 'text-text-p'
                              : 'text-text-t'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>

                      {/* Event badges */}
                      <div className="w-full flex flex-col gap-[2px] overflow-hidden">
                        {dayBookings.slice(0, 3).map((b) => {
                          const client = getClient(b.client_id ?? '');
                          const name = client?.display_name || client?.name || 'Walk-in';
                          return (
                            <div
                              key={b.id}
                              className="rounded-sm px-1 py-[1px] text-[12px] leading-tight overflow-hidden whitespace-nowrap"
                              style={{ backgroundColor: `${typeColor[b.type]}18`, ...(b.rescheduled ? { outline: '1px solid #CF6679', outlineOffset: -1 } : {}) }}
                            >
                              <span style={{ color: typeColor[b.type], maskImage: 'linear-gradient(to right, black 70%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 70%, transparent 100%)', display: 'block' }}>
                                {name}
                              </span>
                            </div>
                          );
                        })}
                        {dayBookings.length > 3 && (
                          <div className="text-[12px] text-text-t text-center">
                            {dayBookings.length - 3} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div ref={bottomSentinelRef} className="h-1" />
      </div>
    </div>
  );
}
