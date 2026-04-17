import { Fragment, useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
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
import { getTypeColor, getTypeColorAlpha } from '../../types';

const MONTHS_BUFFER = 6;

function getMonthRange(center: Date, buffer: number) {
  const months: Date[] = [];
  for (let i = -buffer; i <= buffer; i++) {
    months.push(addMonths(center, i));
  }
  return months;
}

export default function MonthView() {
  const { setCalendarDate, setCalendarView, openBookingForm, setTodayHandler, setScrollToCurrentMonth, setCalendarSearchOpen, setHeaderLeft, setHeaderRight } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  // Always center the list on actual today at mount. `calendarDate` from
  // the store can be stale: the user may have tapped an old booking, the
  // agent may have navigated to a past date, or the PWA may have been
  // backgrounded long enough for the store's initial `new Date()` (captured
  // once at module load) to drift out of the current month. Rebuilding
  // around a fresh `new Date()` on every mount guarantees today's month
  // is always the scroll anchor.
  const [months, setMonths] = useState(() => getMonthRange(new Date(), MONTHS_BUFFER));
  const [visibleYear, setVisibleYear] = useState(() => new Date().getFullYear());
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentMonthRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll to today's month on mount. useLayoutEffect (not useEffect) so
  // the scroll lands synchronously before paint — otherwise the
  // IntersectionObserver below can fire for the still-visible top sentinel
  // on the very first tick, prepending 6 more months and leaving the user
  // 12 months in the past. (Observed bug — do not regress.)
  useLayoutEffect(() => {
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

  // Register scroll-to-current-month handler (like Today but stays in month view)
  useEffect(() => {
    const handler = () => {
      const today = new Date();
      const todayKey = format(today, 'yyyy-MM');
      const todayEl = monthRefs.current.get(todayKey);

      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // Current month not in DOM — re-center the list
        setMonths(getMonthRange(today, MONTHS_BUFFER));
        hasScrolled.current = false;
        setCalendarDate(today);
      }
    };
    setScrollToCurrentMonth(handler);
    return () => setScrollToCurrentMonth(null);
  }, [setCalendarDate, setScrollToCurrentMonth]);

  const getBookingsForDay = (day: Date) =>
    bookings
      .filter((b) => isSameDay(new Date(b.date), day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleDayClick = (day: Date) => {
    setCalendarDate(day);
    setCalendarView('day');
  };

  // "Current month" means actual today's month, NOT calendarDate's month.
  // This is what drives currentMonthRef and the initial scroll anchor —
  // using calendarDate here is how the scroll used to land on a stale
  // month when the store's date had drifted.
  const isCurrentMonth = (month: Date) => {
    const today = new Date();
    return (
      month.getFullYear() === today.getFullYear() &&
      month.getMonth() === today.getMonth()
    );
  };

  // Register header buttons
  useEffect(() => {
    setHeaderLeft(
      <button
        onClick={() => setCalendarView('year')}
        className="flex items-center gap-1 text-text-p active:opacity-70 transition-opacity cursor-pointer press-scale min-h-[44px]"
      >
        <ChevronLeft size={20} />
        <span className="text-[22px] font-medium">{visibleYear}</span>
      </button>
    );
    setHeaderRight(
      <div className="flex items-center gap-2">
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
    );
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [visibleYear, setCalendarView, setCalendarSearchOpen, openBookingForm, setHeaderLeft, setHeaderRight]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Fixed day headers — width-capped on desktop so the grid below it
          doesn't stretch into huge cells on wide screens. max-w-5xl matches
          the scroll container's cap; both must stay in sync so headers and
          day columns line up. */}
      <div className="grid grid-cols-7 px-3 shrink-0 lg:max-w-5xl lg:w-full lg:mx-auto">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="py-2 text-center text-md text-text-t font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable months — same desktop cap as the header so each cell
          ends up ~140-150px wide rather than 200+px on wide monitors. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-4 lg:max-w-5xl lg:w-full lg:mx-auto">
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
                      className={`flex flex-col items-start px-0.5 py-0.5 min-h-[64px] border-b border-border/15 transition-colors lg:aspect-square lg:min-h-0 lg:overflow-hidden lg:px-1 lg:py-1 ${
                        inMonth ? 'cursor-pointer active:bg-elevated/30' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      {/* Date number */}
                      <div className="w-full flex justify-center mb-1">
                        <span
                          className={`w-10 h-10 flex items-center justify-center rounded-full text-[20px] ${
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

                      {/* Event badges — 2px gap on mobile (pills are tiny),
                          wider gap on desktop so the larger BookingCard-style
                          entries have breathing room. */}
                      <div className="w-full flex flex-col gap-[2px] lg:gap-1.5 overflow-hidden">
                        {dayBookings.slice(0, 3).map((b) => {
                          const client = getClient(b.client_id ?? '');
                          const name = client?.display_name || client?.name || 'Walk-in';
                          return (
                            <Fragment key={b.id}>
                              {/* Mobile compact pill — unchanged from original. Desktop
                                  variant below is display:none here via lg:hidden, so
                                  mobile paint/layout cost is identical to before. */}
                              <div
                                className="lg:hidden rounded-sm px-1 py-[1px] text-[12px] leading-tight overflow-hidden whitespace-nowrap"
                                style={{ backgroundColor: getTypeColorAlpha(b.type, 0.09), ...(b.rescheduled ? { outline: '1px solid var(--color-danger)', outlineOffset: -1 } : {}) }}
                              >
                                <span style={{ color: getTypeColor(b.type), maskImage: 'linear-gradient(to right, black 70%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 70%, transparent 100%)', display: 'block' }}>
                                  {name}
                                </span>
                              </div>
                              {/* Desktop BookingCard-style card (matches agent's
                                  scheduling search results): colored side strip +
                                  client/type on top line, time on second line.
                                  hidden on mobile so it does not render there.
                                  Sizing mirrors BookingCard (bg-surface/60,
                                  text-[15px]/[13px], w-1 strip, rounded-lg). */}
                              <div
                                className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg bg-surface/60 border border-border/40 overflow-hidden"
                                style={b.rescheduled ? { outline: '1px solid var(--color-danger)', outlineOffset: -1 } : {}}
                              >
                                <div
                                  className="w-1 self-stretch rounded-full shrink-0"
                                  style={{ backgroundColor: getTypeColor(b.type) }}
                                />
                                <div className="min-w-0 flex-1 text-left">
                                  <div className="text-[15px] text-text-p truncate leading-tight">
                                    {name} · {b.type}
                                  </div>
                                  <div className="text-[13px] text-text-t truncate leading-tight">
                                    {format(new Date(b.date), 'h:mm a')} · {b.duration}h
                                  </div>
                                </div>
                              </div>
                            </Fragment>
                          );
                        })}
                        {dayBookings.length > 3 && (
                          <div className="text-[12px] lg:text-[13px] text-text-t text-center lg:text-left lg:px-3">
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
