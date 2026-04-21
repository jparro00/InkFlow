import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { Clock, Check } from 'lucide-react';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { getTypeColor, getTypeColorAlpha, getBookingLabel } from '../../types';

const HOUR_H = 32;
const VISIBLE_HEIGHT = 280;
const TOTAL_HOURS = 24;
const MINUTES = [0, 15, 30, 45];
const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];

// Cylinder picker dimensions
const CYL_ITEM_H = 40;
const CYL_VISIBLE = 5;
const CYL_H = CYL_ITEM_H * CYL_VISIBLE;
const CYL_PAD = CYL_ITEM_H * 2;

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  date: string;
  duration: number;
  bookingType?: string;
  editingBookingId?: string;
  onOpenChange?: (open: boolean) => void;
  onCylinderChange?: (open: boolean) => void;
  excludeRefs?: React.RefObject<HTMLElement | null>[];
}

function to12(h24: number): { hour12: number; period: 'AM' | 'PM' } {
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { hour12, period };
}

function to24(hour12: number, period: 'AM' | 'PM'): number {
  if (period === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

// iOS Calendar-style scroll cylinder column
function CylinderColumn<T extends string | number>({
  items,
  value,
  onChange,
  formatItem,
}: {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  formatItem?: (v: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const suppressScroll = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdx = items.indexOf(value);

  // Scroll to selected item on mount or when value changes externally
  useEffect(() => {
    if (!ref.current) return;
    const target = selectedIdx * CYL_ITEM_H;
    if (Math.abs(ref.current.scrollTop - target) > 2) {
      suppressScroll.current = true;
      ref.current.scrollTop = target;
      requestAnimationFrame(() => { suppressScroll.current = false; });
    }
  }, [selectedIdx]);

  const handleScroll = useCallback(() => {
    if (!ref.current || suppressScroll.current) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / CYL_ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      if (items[clamped] !== value) {
        onChange(items[clamped]);
      }
    }, 60);
  }, [items, value, onChange]);

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto no-scrollbar"
      style={{
        height: CYL_H,
        scrollSnapType: 'y mandatory',
        scrollPaddingTop: CYL_PAD,
        WebkitOverflowScrolling: 'touch',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)',
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: CYL_PAD }} />
      {items.map((item, i) => (
        <div
          key={String(item)}
          className={`flex items-center justify-center ${
            i === selectedIdx ? 'text-text-p font-semibold' : 'text-text-s'
          }`}
          style={{
            height: CYL_ITEM_H,
            scrollSnapAlign: 'start',
            fontSize: i === selectedIdx ? 20 : 17,
          }}
        >
          {formatItem ? formatItem(item) : String(item)}
        </div>
      ))}
      <div style={{ height: CYL_PAD }} />
    </div>
  );
}

export default function TimePicker({ value, onChange, date, duration, bookingType, editingBookingId, onOpenChange, onCylinderChange, excludeRefs }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [showCylinder, setShowCylinder] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allBookings = useBookingStore((s) => s.bookings);
  const getClient = useClientStore((s) => s.getClient);

  const selectedDate = date ? new Date(date + 'T00:00:00') : null;

  const dayBookings = useMemo(() => {
    if (!selectedDate) return [];
    return allBookings
      .filter((b) => {
        if (editingBookingId && b.id === editingBookingId) return false;
        return isSameDay(new Date(b.date), selectedDate);
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allBookings, selectedDate, editingBookingId]);

  const [selHour, selMin] = value ? value.split(':').map(Number) : [10, 0];
  const selStart = selHour + selMin / 60;
  const { hour12, period } = to12(selHour);

  const previewOffset = Math.round(VISIBLE_HEIGHT / 3);
  const topPadding = previewOffset;
  const bottomPadding = VISIBLE_HEIGHT - previewOffset;
  const totalScrollHeight = TOTAL_HOURS * HOUR_H + topPadding + bottomPadding;

  const timeToScroll = useCallback((hour: number) => hour * HOUR_H, []);

  const scrollToTime = useCallback((scrollTop: number) => {
    const hourFloat = scrollTop / HOUR_H;
    const totalMins = Math.max(0, Math.min(23 * 60 + 45, Math.round(hourFloat * 4) * 15));
    return { hour: Math.floor(totalMins / 60), min: totalMins % 60 };
  }, []);

  const setOpenAndNotify = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setShowCylinder(false);
    onOpenChange?.(next);
  }, [onOpenChange]);

  // Sync timeline scroll when opening or when value changes externally.
  // Skip if the scroll position is already close (means it came from the timeline itself).
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && scrollRef.current) {
      const target = timeToScroll(selStart);
      const justOpened = !prevOpen.current;
      prevOpen.current = open;
      if (Math.abs(scrollRef.current.scrollTop - target) > HOUR_H / 2) {
        isInputDriven.current = true;
        if (justOpened) {
          // Instant on first open — no animation needed
          scrollRef.current.scrollTop = target;
        } else {
          // Animated when switching time while already open (e.g. Morning/Evening)
          scrollRef.current.scrollTo({ top: target, behavior: 'smooth' });
        }
        setTimeout(() => { isInputDriven.current = false; }, justOpened ? 16 : 400);
      }
    } else {
      prevOpen.current = open;
    }
  }, [open, selStart, timeToScroll]);

  // Sync timeline scroll when value changes from the cylinder
  const syncScrollToValue = useCallback((h24: number, m: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = timeToScroll(h24 + m / 60);
  }, [timeToScroll]);

  // Update time on timeline scroll
  const isInputDriven = useRef(false);
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isInputDriven.current) return;
    const { hour, min } = scrollToTime(scrollRef.current.scrollTop);
    onChange(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }, [scrollToTime, onChange]);

  // Cylinder-based time change
  const setTime = useCallback((h24: number, m: number) => {
    const clamped = Math.max(0, Math.min(23, h24));
    const time = `${String(clamped).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange(time);
    isInputDriven.current = true;
    syncScrollToValue(clamped, m);
    requestAnimationFrame(() => { isInputDriven.current = false; });
  }, [onChange, syncScrollToValue]);

  const handleHourChange = useCallback((h: number) => {
    setTime(to24(h, period), selMin);
  }, [period, selMin, setTime]);

  const handleMinuteChange = useCallback((m: number) => {
    setTime(to24(hour12, period), m);
  }, [hour12, period, setTime]);

  const handlePeriodChange = useCallback((p: 'AM' | 'PM') => {
    setTime(to24(hour12, p), selMin);
  }, [hour12, selMin, setTime]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (excludeRefs?.some(ref => ref.current?.contains(e.target as Node))) return;
        setOpenAndNotify(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open, setOpenAndNotify]);

  const displayText = value
    ? format(new Date(2026, 0, 1, selHour, selMin), 'h:mm a')
    : 'Select time';

  return (
    <div ref={containerRef}>
      {/* Trigger row */}
      <div className="flex items-center gap-2">
        {open ? (
          <div className="flex-1 flex items-center bg-input border border-accent/40 rounded-md" style={{ height: 48 }}>
            <div className="flex items-center px-3 flex-1">
              <Clock size={16} className="text-text-t shrink-0 mr-2" />
              {/* Time pill — tap to toggle cylinder picker */}
              <button
                type="button"
                onClick={() => {
                  const next = !showCylinder;
                  setShowCylinder(next);
                  onCylinderChange?.(next);
                }}
                className={`flex items-center gap-0.5 px-3 py-1 rounded-full cursor-pointer press-scale transition-colors ${
                  showCylinder
                    ? 'bg-accent/15 border border-accent/40'
                    : 'bg-accent/8 border border-accent/20'
                }`}
              >
                <span className="text-base font-medium text-text-p tabular-nums">{hour12}</span>
                <span className="text-base text-text-t font-medium">:</span>
                <span className="text-base font-medium text-text-p tabular-nums">{String(selMin).padStart(2, '0')}</span>
                <span className="ml-1 text-sm font-medium text-accent">{period}</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpenAndNotify(true)}
            className={`flex-1 bg-input border border-border/60 rounded-md px-4 text-left text-base flex items-center gap-3 transition-colors cursor-pointer ${value ? 'text-text-p' : 'text-text-t'}`}
            style={{ height: 48 }}
          >
            <Clock size={16} className="text-text-t shrink-0" />
            {displayText}
          </button>
        )}
        {open && (
          <button
            type="button"
            onClick={() => setOpenAndNotify(false)}
            className="w-12 h-12 rounded-md bg-accent text-bg flex items-center justify-center cursor-pointer press-scale shadow-glow active:shadow-glow-strong shrink-0"
          >
            <Check size={18} />
          </button>
        )}
      </div>

      {/* Cylinder picker */}
      {open && showCylinder && (
        <div className="mt-2 bg-elevated border border-accent/20 rounded-lg shadow-glow overflow-hidden relative">
          {/* Selection highlight bar spanning all columns */}
          <div
            className="absolute left-2 right-2 rounded-lg bg-accent/8 border border-accent/15 pointer-events-none z-10"
            style={{ top: CYL_PAD, height: CYL_ITEM_H }}
          />
          <div className="flex">
            <CylinderColumn items={HOURS_12} value={hour12} onChange={handleHourChange} />
            <CylinderColumn
              items={MINUTES}
              value={selMin}
              onChange={handleMinuteChange}
              formatItem={(m) => String(m).padStart(2, '0')}
            />
            <CylinderColumn items={PERIODS} value={period} onChange={handlePeriodChange} />
          </div>
        </div>
      )}

      {/* Expanded scroll picker */}
      {open && (
        <div className="mt-2 bg-elevated border border-accent/20 rounded-lg shadow-glow overflow-hidden relative">
          {selectedDate && (
            <div className="text-center text-sm text-text-s font-medium py-2 border-b border-border/30">
              {format(selectedDate, 'EEEE, MMM d')}
            </div>
          )}

          {/* Fixed preview block */}
          {(() => {
            const bType = (bookingType || 'Regular') as import('../../types').BookingType;
            const previewColor = getTypeColor(bType);
            return (
              <div
                className="absolute left-12 right-3 z-10 pointer-events-none rounded"
                style={{
                  top: (selectedDate ? 37 : 0) + previewOffset,
                  height: Math.max(duration * HOUR_H, 20),
                  backgroundColor: getTypeColorAlpha(bType, 0.09),
                  border: `2px solid ${previewColor}`,
                  borderLeftWidth: 3,
                }}
              >
                <div className="text-2xs font-medium px-2 py-0.5" style={{ color: previewColor }}>
                  {format(new Date(2026, 0, 1, selHour, selMin), 'h:mm a')} · {duration}h
                </div>
              </div>
            );
          })()}

          {/* Scrollable timeline */}
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ height: VISIBLE_HEIGHT }}
            onScroll={handleScroll}
          >
            <div className="relative" style={{ height: totalScrollHeight }}>
              {Array.from({ length: TOTAL_HOURS }, (_, i) => i).map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full flex"
                  style={{ top: topPadding + hour * HOUR_H, height: HOUR_H }}
                >
                  <div className="w-12 text-2xs text-text-t text-right pr-2 shrink-0" style={{ marginTop: -6 }}>
                    {hour > 0 ? format(new Date(2026, 0, 1, hour), 'h a') : '12 AM'}
                  </div>
                  <div className="flex-1 border-t border-border/15" />
                </div>
              ))}

              {selectedDate && isToday(selectedDate) && (() => {
                const now = new Date();
                const currentHour = now.getHours() + now.getMinutes() / 60;
                const top = topPadding + currentHour * HOUR_H;
                return (
                  <div className="absolute left-0 right-0 z-5 pointer-events-none flex items-center" style={{ top, transform: 'translateY(-50%)' }}>
                    <div className="w-12 shrink-0" />
                    <div className="flex-1 h-[2px] bg-today" />
                  </div>
                );
              })()}

              {dayBookings.map((booking) => {
                const d = new Date(booking.date);
                const startHour = d.getHours() + d.getMinutes() / 60;
                const top = topPadding + startHour * HOUR_H;
                const height = booking.duration * HOUR_H;
                const client = getClient(booking.client_id ?? '');
                const color = getTypeColor(booking.type);
                return (
                  <div
                    key={booking.id}
                    className="absolute left-12 right-1 rounded px-2 py-0.5 pointer-events-none overflow-hidden"
                    style={{
                      top,
                      height: Math.max(height, 20),
                      backgroundColor: getTypeColorAlpha(booking.type, 0.12),
                      borderLeft: `2px solid ${color}`,
                    }}
                  >
                    <div className="text-2xs text-text-s truncate">
                      {getBookingLabel(booking, client?.display_name || client?.name)} · {format(d, 'h:mm a')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
