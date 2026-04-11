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
} from 'date-fns';
import { useUIStore } from '../../stores/uiStore';

const YEARS_BUFFER = 2;

function getYearRange(centerYear: number, buffer: number) {
  const years: number[] = [];
  for (let i = -buffer; i <= buffer; i++) {
    years.push(centerYear + i);
  }
  return years;
}

function getMonthsOfYear(year: number) {
  return Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
}

export default function YearView() {
  const { calendarDate, setCalendarDate, setCalendarView, setTodayHandler } = useUIStore();

  const [years, setYears] = useState(() =>
    getYearRange(calendarDate.getFullYear(), YEARS_BUFFER)
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentYearRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  const currentMonthRef = useRef<HTMLButtonElement>(null);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Scroll to current year on mount
  useEffect(() => {
    if (!hasScrolled.current && currentYearRef.current) {
      currentYearRef.current.scrollIntoView({ block: 'start' });
      hasScrolled.current = true;
    }
  }, [years]);

  // Infinite scroll
  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (entry.target === topSentinelRef.current) {
        setYears((prev) => {
          const earliest = prev[0];
          const newYears: number[] = [];
          for (let i = YEARS_BUFFER; i >= 1; i--) {
            newYears.push(earliest - i);
          }
          return [...newYears, ...prev];
        });
      } else if (entry.target === bottomSentinelRef.current) {
        setYears((prev) => {
          const latest = prev[prev.length - 1];
          const newYears: number[] = [];
          for (let i = 1; i <= YEARS_BUFFER; i++) {
            newYears.push(latest + i);
          }
          return [...prev, ...newYears];
        });
      }
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, {
      root: scrollRef.current,
      rootMargin: '300px',
    });
    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);
    return () => observer.disconnect();
  }, [handleIntersect]);

  // Register Today handler: if current month visible → open month view, else scroll to current year
  useEffect(() => {
    const handler = () => {
      const today = new Date();
      if (currentMonthRef.current && scrollRef.current) {
        const elRect = currentMonthRef.current.getBoundingClientRect();
        const containerRect = scrollRef.current.getBoundingClientRect();
        const isVisible = elRect.top < containerRect.bottom && elRect.bottom > containerRect.top;

        if (isVisible) {
          setCalendarDate(today);
          setCalendarView('month');
        } else if (currentYearRef.current) {
          currentYearRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        setCalendarDate(today);
      }
    };
    setTodayHandler(handler);
    return () => setTodayHandler(null);
  }, [setCalendarDate, setCalendarView, setTodayHandler]);

  const handleMonthClick = (month: Date) => {
    setCalendarDate(month);
    setCalendarView('month');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Scrollable year grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div ref={topSentinelRef} className="h-1" />

        {years.map((year) => {
          const isCurrentYear = year === currentYear;
          const months = getMonthsOfYear(year);

          return (
            <div
              key={year}
              ref={isCurrentYear ? currentYearRef : undefined}
              className="mb-6"
            >
              {/* Year heading */}
              <h1 className="font-display text-2xl text-text-p pt-2 pb-2">
                {year}
              </h1>

              {/* 3-column month grid */}
              <div className="grid grid-cols-3 gap-x-[4px] gap-y-[2px]">
                {months.map((month) => {
                  const monthIdx = month.getMonth();
                  const isThisMonth = isCurrentYear && monthIdx === currentMonth;
                  const monthStart = startOfMonth(month);
                  const monthEnd = endOfMonth(month);
                  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
                  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
                  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

                  return (
                    <button
                      key={monthIdx}
                      ref={isThisMonth ? currentMonthRef : undefined}
                      onClick={() => handleMonthClick(month)}
                      className="text-left cursor-pointer active:bg-elevated/30 rounded-lg px-1 py-0.5 transition-colors"
                    >
                      {/* Month name */}
                      <div
                        className={`text-sm font-medium mb-1.5 ${
                          isThisMonth ? 'text-today' : 'text-text-s'
                        }`}
                      >
                        {format(month, 'MMMM')}
                      </div>

                      {/* Mini day headers */}
                      <div className="grid grid-cols-7 gap-0">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                          <div
                            key={i}
                            className="text-[8px] text-text-t text-center leading-none pb-0.5"
                          >
                            {d}
                          </div>
                        ))}
                      </div>

                      {/* Mini day grid */}
                      <div className="grid grid-cols-7 gap-0">
                        {days.map((day) => {
                          const inMonth = isSameMonth(day, month);
                          const today = isToday(day);

                          return (
                            <div
                              key={day.toISOString()}
                              className="flex items-center justify-center h-[16px]"
                            >
                              {inMonth && (
                                <span
                                  className={`text-[9px] leading-none w-[14px] h-[14px] flex items-center justify-center rounded-full ${
                                    today
                                      ? 'bg-today text-white font-bold'
                                      : 'text-text-s'
                                  }`}
                                >
                                  {format(day, 'd')}
                                </span>
                              )}
                            </div>
                          );
                        })}
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
