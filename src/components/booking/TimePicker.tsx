import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { Clock, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { getTypeColor, getTypeColorAlpha } from '../../types';

const HOUR_H = 32;
const VISIBLE_HEIGHT = 280;
const TOTAL_HOURS = 24;
const MINUTES = [0, 15, 30, 45];

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  date: string;
  duration: number;
  bookingType?: string;
  editingBookingId?: string;
  onOpenChange?: (open: boolean) => void;
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

export default function TimePicker({ value, onChange, date, duration, bookingType, editingBookingId, onOpenChange }: TimePickerProps) {
  const [open, setOpen] = useState(false);
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
    onOpenChange?.(next);
  }, [onOpenChange]);

  // Set initial scroll position when opening
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = timeToScroll(selStart);
    }
  }, [open]);

  // Sync scroll when value changes from the tappable selector
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

  // Tap-based time change helpers
  const setTime = useCallback((h24: number, m: number) => {
    const clamped = Math.max(0, Math.min(23, h24));
    const time = `${String(clamped).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange(time);
    isInputDriven.current = true;
    syncScrollToValue(clamped, m);
    requestAnimationFrame(() => { isInputDriven.current = false; });
  }, [onChange, syncScrollToValue]);

  const cycleHour = useCallback((dir: 1 | -1) => {
    const next12 = ((hour12 - 1 + dir + 12) % 12) + 1;
    setTime(to24(next12, period), selMin);
  }, [hour12, period, selMin, setTime]);

  const cycleMinute = useCallback((dir: 1 | -1) => {
    const idx = MINUTES.indexOf(selMin);
    const nextIdx = (idx + dir + MINUTES.length) % MINUTES.length;
    setTime(to24(hour12, period), MINUTES[nextIdx]);
  }, [hour12, period, selMin, setTime]);

  const togglePeriod = useCallback(() => {
    const newPeriod = period === 'AM' ? 'PM' : 'AM';
    setTime(to24(hour12, newPeriod), selMin);
  }, [hour12, period, selMin, setTime]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const spinnerBtn = "w-8 h-8 flex items-center justify-center rounded-md text-text-t active:text-text-p active:bg-surface transition-colors cursor-pointer press-scale";

  return (
    <div ref={containerRef}>
      {/* Trigger row */}
      <div className="flex items-center gap-2">
        {open ? (
          <div className="flex-1 flex items-center gap-1 bg-input border border-accent/40 rounded-md px-3" style={{ height: 48 }}>
            <Clock size={16} className="text-text-t shrink-0 mr-1" />
            {/* Hour spinner */}
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => cycleHour(1)} className={spinnerBtn}><ChevronUp size={14} /></button>
              <span className="text-lg font-medium text-text-p w-8 text-center tabular-nums">{hour12}</span>
              <button type="button" onClick={() => cycleHour(-1)} className={spinnerBtn}><ChevronDown size={14} /></button>
            </div>
            <span className="text-lg text-text-t font-medium">:</span>
            {/* Minute spinner */}
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => cycleMinute(1)} className={spinnerBtn}><ChevronUp size={14} /></button>
              <span className="text-lg font-medium text-text-p w-8 text-center tabular-nums">{String(selMin).padStart(2, '0')}</span>
              <button type="button" onClick={() => cycleMinute(-1)} className={spinnerBtn}><ChevronDown size={14} /></button>
            </div>
            {/* AM/PM toggle */}
            <button
              type="button"
              onClick={togglePeriod}
              className="ml-1 px-2.5 py-1 rounded-md text-sm font-medium bg-accent/10 text-accent active:bg-accent/20 transition-colors cursor-pointer press-scale"
            >
              {period}
            </button>
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
                      {client?.display_name || client?.name || 'Walk-in'} · {format(d, 'h:mm a')}
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
