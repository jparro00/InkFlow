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
import {
  getTypeColor,
  getTypeColorAlpha,
  getBookingLabel,
  type Booking,
} from '../../types';
import { isBarBooking } from '../../utils/bookingRanges';

const MS_PER_DAY = 86400000;
// Bar visual height. Matches pill font-size (12px) + breathing room so the
// bar label reads at the same size as the single-day pills beneath it.
const BAR_PX = 16;
const BAR_GAP_PX = 2;

interface BarSegment {
  booking: Booking;
  /** Index (0-6) where this segment starts in the week. */
  startCol: number;
  /** Number of columns covered in this week. */
  span: number;
  /** Row slot assigned by the greedy packer (0 = topmost). */
  lane: number;
  /** Booking begins in a prior week — left side should stay square (no left radius). */
  continuesLeft: boolean;
  /** Booking ends in a later week — right side should stay square (no right radius). */
  continuesRight: boolean;
}

/**
 * Greedy per-week packer: returns segments for every bar-worthy booking that
 * touches the week AND the rendered month, clipped to the intersection of
 * [weekStart, weekEnd) and [monthStart, nextMonthStart). Clipping to the
 * month matters because a grid week straddling two months is rendered twice
 * (once in each month's grid) — without the extra month clip the same bar
 * would be drawn on the hidden out-of-month cells of the neighboring month.
 */
function computeWeekBars(weekDays: Date[], bookings: Booking[], month: Date): BarSegment[] {
  if (weekDays.length === 0) return [];
  const weekStart = new Date(weekDays[0]); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekDays[weekDays.length - 1]); weekEnd.setHours(0, 0, 0, 0);
  weekEnd.setDate(weekEnd.getDate() + 1);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();

  const monthStartMs = startOfMonth(month).getTime();
  const nextMonthStartMs = startOfMonth(addMonths(month, 1)).getTime();
  const visibleStartMs = Math.max(weekStartMs, monthStartMs);
  const visibleEndMs = Math.min(weekEndMs, nextMonthStartMs);
  if (visibleEndMs <= visibleStartMs) return [];

  const candidates = bookings
    .filter((b) => isBarBooking(b))
    .filter((b) => {
      const start = new Date(b.date).getTime();
      const end = new Date(b.end_date).getTime();
      return start < visibleEndMs && end > visibleStartMs;
    })
    .sort((a, b) => {
      const aStart = new Date(a.date).getTime();
      const bStart = new Date(b.date).getTime();
      if (aStart !== bStart) return aStart - bStart;
      const aLen = new Date(a.end_date).getTime() - aStart;
      const bLen = new Date(b.end_date).getTime() - bStart;
      return bLen - aLen;
    });

  const laneEnds: number[] = [];
  const segments: BarSegment[] = [];

  for (const b of candidates) {
    const bStart = new Date(b.date).getTime();
    const bEnd = new Date(b.end_date).getTime();
    const clipStart = Math.max(bStart, visibleStartMs);
    const clipEnd = Math.min(bEnd, visibleEndMs);
    if (clipEnd <= clipStart) continue;
    const startCol = Math.floor((clipStart - weekStartMs) / MS_PER_DAY);
    const endCol = Math.ceil((clipEnd - weekStartMs) / MS_PER_DAY);
    const span = Math.max(1, endCol - startCol);

    let lane = laneEnds.findIndex((endMs) => endMs <= clipStart);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = clipEnd;

    segments.push({
      booking: b,
      startCol,
      span,
      lane,
      // Square off the ends when the booking extends past the visible
      // (week ∩ month) range — covers both cross-week and cross-month cases.
      continuesLeft: bStart < visibleStartMs,
      continuesRight: bEnd > visibleEndMs,
    });
  }

  return segments;
}

const MONTHS_BUFFER = 6;

function getMonthRange(center: Date, buffer: number) {
  const months: Date[] = [];
  for (let i = -buffer; i <= buffer; i++) {
    months.push(addMonths(center, i));
  }
  return months;
}

export default function MonthView() {
  const { calendarDate, setCalendarDate, setCalendarView, openBookingForm, setTodayHandler, setScrollToCurrentMonth, setCalendarSearchOpen, setHeaderLeft, setHeaderRight } = useUIStore();
  const bookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  // Anchor the initial scroll on calendarDate — whatever month the user
  // was last looking at (day view, agent navigation, tapped booking). The
  // "Today" button is the dedicated path back to actual-today; it has its
  // own handler further down that resets the list if today isn't in range.
  const anchorDate = calendarDate ?? new Date();
  const [months, setMonths] = useState(() => getMonthRange(anchorDate, MONTHS_BUFFER));
  const [visibleYear, setVisibleYear] = useState(() => anchorDate.getFullYear());
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentMonthRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Today's actual day-cell element (the in-month button, not a spillover).
  // Used by the Today handler to scope its "is it visible?" check to the day
  // row, not just the month container — otherwise scrolling that has the
  // month header on screen but today's row off-screen still counts as
  // visible, and one tap jumps straight to day view.
  const todayCellRef = useRef<HTMLButtonElement | null>(null);

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

  // Register Today handler. Two-tap pattern (Apple Calendar–style):
  //   1) today's day cell is visible → switch to day view
  //   2) today's day cell is off-screen → scroll it into view, stay in month view
  //   3) today's month not in DOM yet → set the date and let the list re-anchor
  // We check visibility against the day cell, not the month container, because
  // the month spans many rows — a user with the month header at the top but
  // today's row scrolled past the bottom should still get a "scroll first" tap.
  useEffect(() => {
    const handler = () => {
      const today = new Date();
      const todayCell = todayCellRef.current;

      if (todayCell && scrollRef.current) {
        const container = scrollRef.current;
        const cellRect = todayCell.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isVisible =
          cellRect.top < containerRect.bottom && cellRect.bottom > containerRect.top;

        if (isVisible) {
          setCalendarDate(today);
          setCalendarView('day');
        } else {
          todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        // Today's month isn't rendered — fall back to the month-level scroll
        // path, then let the next tap promote to day view.
        const todayKey = format(today, 'yyyy-MM');
        const todayMonthEl = monthRefs.current.get(todayKey);
        if (todayMonthEl) {
          todayMonthEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          setCalendarDate(today);
        }
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

  // Pills = single-day timed bookings only. All-day/multi-day render as bars
  // in a separate layer above the pill stack (see computeWeekBars).
  const getPillsForDay = (day: Date) =>
    bookings
      .filter((b) => !isBarBooking(b) && isSameDay(new Date(b.date), day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleDayClick = (day: Date) => {
    setCalendarDate(day);
    setCalendarView('day');
  };

  // The "anchor month" is the month we want scrolled to on mount —
  // derived from calendarDate so that pressing Month in day view returns
  // to the same month. `currentMonthRef` below tracks this element.
  const isAnchorMonth = (month: Date) => (
    month.getFullYear() === anchorDate.getFullYear() &&
    month.getMonth() === anchorDate.getMonth()
  );

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
          const isCurrent = isAnchorMonth(month);

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

              {/* Week rows. Splitting by week lets us compute per-week bar
                  lane assignments for multi-day / all-day events — each week
                  gets its own greedy packer so bars never collide within a
                  week. Single-day timed bookings still render as pills below
                  the bar stack. */}
              {(() => {
                const weeks: Date[][] = [];
                for (let i = 0; i < days.length; i += 7) {
                  weeks.push(days.slice(i, i + 7));
                }
                return weeks.map((weekDays, wIdx) => {
                  const weekBars = computeWeekBars(weekDays, bookings, month);
                  const laneCount = weekBars.reduce((max, s) => Math.max(max, s.lane + 1), 0);
                  const lanesHeight = laneCount > 0
                    ? laneCount * BAR_PX + Math.max(0, laneCount - 1) * BAR_GAP_PX
                    : 0;

                  return (
                    <div key={wIdx} className="relative grid grid-cols-7">
                      {weekDays.map((day) => {
                        const inMonth = isSameMonth(day, month);
                        const today = isToday(day);
                        const pills = inMonth ? getPillsForDay(day) : [];

                        return (
                          <button
                            key={day.toISOString()}
                            ref={today && inMonth ? todayCellRef : undefined}
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

                            {/* Spacer reserves vertical room for the absolute bar overlay below.
                                Keeping it per-cell (rather than a row-level spacer) lets each cell's
                                flex column keep the date → lanes → pills stacking intact. */}
                            {lanesHeight > 0 && (
                              <div style={{ height: lanesHeight, marginBottom: 2 }} />
                            )}

                            {/* Single-day pills — same dual-mode rendering as
                                before (mobile compact, desktop BookingCard). */}
                            <div className="w-full flex flex-col gap-[2px] lg:gap-1.5 overflow-hidden">
                              {pills.slice(0, 3).map((b) => {
                                const client = getClient(b.client_id ?? '');
                                const name = getBookingLabel(b, client?.display_name || client?.name);
                                return (
                                  <Fragment key={b.id}>
                                    <div
                                      className="lg:hidden rounded-sm px-1 py-[1px] text-[12px] leading-tight overflow-hidden whitespace-nowrap"
                                      style={{ backgroundColor: getTypeColorAlpha(b.type, 0.09), ...(b.rescheduled ? { outline: '1px solid var(--color-danger)', outlineOffset: -1 } : {}) }}
                                    >
                                      <span style={{ color: getTypeColor(b.type), maskImage: 'linear-gradient(to right, black 70%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 70%, transparent 100%)', display: 'block' }}>
                                        {name}
                                      </span>
                                    </div>
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
                              {pills.length > 3 && (
                                <div className="text-[12px] lg:text-[13px] text-text-t text-center lg:text-left lg:px-3">
                                  {pills.length - 3} more
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {/* Bar overlay: one element per BarSegment, rendered at
                          the week level so the label can span the full width of
                          a multi-day bar instead of being truncated per cell.
                          Positioned over the per-cell spacer above — its `top`
                          matches the date-block height (py-0.5 + h-10 + mb-1). */}
                      {laneCount > 0 && (
                        <div
                          className="absolute left-0 right-0 pointer-events-none"
                          style={{
                            top: 'calc(0.125rem + 2.5rem + 0.25rem)',
                            height: lanesHeight,
                          }}
                        >
                          {weekBars.map((seg) => {
                            const { booking, startCol, span, lane, continuesLeft, continuesRight } = seg;
                            const client = getClient(booking.client_id ?? '');
                            const name = getBookingLabel(booking, client?.display_name || client?.name);
                            const isBlocking = booking.blocks_availability;
                            return (
                              <div
                                key={booking.id + '-' + wIdx}
                                className="absolute overflow-hidden whitespace-nowrap text-[12px] font-medium pointer-events-auto"
                                style={{
                                  left: `calc(${(startCol / 7) * 100}%)`,
                                  width: `calc(${(span / 7) * 100}%)`,
                                  top: lane * (BAR_PX + BAR_GAP_PX),
                                  height: BAR_PX,
                                  lineHeight: `${BAR_PX}px`,
                                  backgroundColor: isBlocking
                                    ? getTypeColorAlpha(booking.type, 0.28)
                                    : getTypeColorAlpha(booking.type, 0.1),
                                  color: getTypeColor(booking.type),
                                  fontStyle: isBlocking ? 'normal' : 'italic',
                                  borderTopLeftRadius: continuesLeft ? 0 : 'var(--radius-sm)',
                                  borderBottomLeftRadius: continuesLeft ? 0 : 'var(--radius-sm)',
                                  borderTopRightRadius: continuesRight ? 0 : 'var(--radius-sm)',
                                  borderBottomRightRadius: continuesRight ? 0 : 'var(--radius-sm)',
                                  paddingLeft: continuesLeft ? 2 : 4,
                                  paddingRight: continuesRight ? 2 : 4,
                                  ...(booking.rescheduled
                                    ? { outline: '1px solid var(--color-danger)', outlineOffset: -1 }
                                    : {}),
                                }}
                              >
                                <span
                                  style={{
                                    display: 'block',
                                    maskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
                                  }}
                                >
                                  {name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          );
        })}

        <div ref={bottomSentinelRef} className="h-1" />
      </div>
    </div>
  );
}
