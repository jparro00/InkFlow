import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameDay, isToday, isSameMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useDrag } from '@use-gesture/react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useBookingStore } from '../../stores/bookingStore';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  missing?: boolean;
}

function buildGrid(month: Date) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

function MonthPanel({ month, selectedDate, bookedDays, onSelect }: {
  month: Date;
  selectedDate: Date | null;
  bookedDays: Set<string>;
  onSelect: (day: Date) => void;
}) {
  const days = buildGrid(month);

  return (
    <div className="shrink-0" style={{ width: '33.333%' }}>
      <div className="text-center text-sm font-medium text-text-p py-1 mb-1">
        {format(month, 'MMMM yyyy')}
      </div>
      <div className="grid grid-cols-7">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-xs text-text-t font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const selected = selectedDate && isSameDay(day, selectedDate);
          const today = isToday(day);
          const hasBooking = bookedDays.has(day.toDateString());
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onSelect(day)}
              className={`flex flex-col items-center justify-center py-1 cursor-pointer rounded-lg transition-colors ${!inMonth ? 'opacity-25' : ''}`}
            >
              <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors ${
                selected ? 'bg-accent text-bg font-medium' : today ? 'text-today font-medium' : 'text-text-p'
              }`}>
                {format(day, 'd')}
              </span>
              <span className={`w-1 h-1 rounded-full mt-0.5 ${hasBooking ? (selected ? 'bg-accent' : 'bg-text-t') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DatePicker({ value, onChange, missing }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return startOfMonth(new Date(value + 'T00:00:00'));
    return startOfMonth(new Date());
  });

  const allBookings = useBookingStore((s) => s.bookings);
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);
  const pendingMonth = useRef<Date | null>(null);

  const prevMonth = subMonths(viewMonth, 1);
  const nextMonth = addMonths(viewMonth, 1);

  const bookedDays = useMemo(() => {
    const set = new Set<string>();
    allBookings.forEach((b) => set.add(new Date(b.date).toDateString()));
    return set;
  }, [allBookings]);

  const handleSelect = useCallback((day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  }, [onChange]);

  const changeMonth = useCallback((dir: 1 | -1) => {
    const w = swipeRef.current?.offsetWidth ?? 300;
    const newMonth = dir === 1 ? addMonths(viewMonth, 1) : subMonths(viewMonth, 1);
    animRef.current?.stop();
    pendingMonth.current = newMonth;
    animRef.current = animate(x, -dir * w, {
      type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
      onComplete: () => {
        x.jump(0);
        setViewMonth(newMonth);
        animRef.current = null;
        pendingMonth.current = null;
      },
    });
  }, [viewMonth, x]);

  const bindSwipe = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], first, last }) => {
      if (first) {
        if (animRef.current && pendingMonth.current) {
          animRef.current.stop();
          x.jump(0);
          setViewMonth(pendingMonth.current);
          pendingMonth.current = null;
          animRef.current = null;
        }
        x.jump(0);
      }
      x.set(mx);
      if (last) {
        if (Math.abs(mx) > 40 || vx > 0.3) {
          const dir = dx > 0 ? -1 : 1;
          const w = swipeRef.current?.offsetWidth ?? 300;
          const newMonth = dir === 1 ? addMonths(viewMonth, 1) : subMonths(viewMonth, 1);
          pendingMonth.current = newMonth;
          animRef.current = animate(x, -dir * w, {
            type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
            onComplete: () => {
              x.jump(0);
              setViewMonth(newMonth);
              animRef.current = null;
              pendingMonth.current = null;
            },
          });
        } else {
          animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
        }
      }
    },
    { axis: 'x', filterTaps: true, threshold: 10, pointer: { touch: true } }
  );

  const displayText = value
    ? format(new Date(value + 'T00:00:00'), 'MMM d, yyyy')
    : 'Select date';

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <div ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full bg-input rounded-xl px-4 text-left text-base flex items-center gap-3 transition-colors cursor-pointer ${
          missing ? 'border-2 border-danger/60' : 'border border-border/60'
        } ${value ? 'text-text-p' : 'text-text-t'}`}
        style={{ height: 48 }}
      >
        <Calendar size={16} className="text-text-t shrink-0" />
        {displayText}
      </button>

      {open && (
        <div className="mt-2 bg-elevated border border-accent/20 rounded-xl p-3 shadow-glow overflow-hidden">
          {/* Navigation arrows */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => changeMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-full text-text-s active:bg-surface cursor-pointer">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => changeMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-full text-text-s active:bg-surface cursor-pointer">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Carousel — 3 panels, center one visible via negative margin */}
          <div {...bindSwipe()} ref={swipeRef} className="overflow-hidden" style={{ touchAction: 'pan-y' }}>
            <motion.div
              className="flex"
              style={{ x, width: '300%', marginLeft: '-100%' }}
            >
              <MonthPanel month={prevMonth} selectedDate={selectedDate} bookedDays={bookedDays} onSelect={handleSelect} />
              <MonthPanel month={viewMonth} selectedDate={selectedDate} bookedDays={bookedDays} onSelect={handleSelect} />
              <MonthPanel month={nextMonth} selectedDate={selectedDate} bookedDays={bookedDays} onSelect={handleSelect} />
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
