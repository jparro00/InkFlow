import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { Clock } from 'lucide-react';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { typeColor } from '../../types';

const HOUR_H = 32;
const VISIBLE_HEIGHT = 280;
const TOTAL_HOURS = 24;

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  date: string;
  duration: number;
  editingBookingId?: string;
}

export default function TimePicker({ value, onChange, date, duration, editingBookingId }: TimePickerProps) {
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

  // The preview block is fixed in the center of the visible area.
  // Scroll position determines the time. We add padding so any hour
  // (0-23) can be centered.
  const topPadding = VISIBLE_HEIGHT / 2;
  const bottomPadding = VISIBLE_HEIGHT / 2;
  const totalScrollHeight = TOTAL_HOURS * HOUR_H + topPadding + bottomPadding;

  // Convert time to scroll position (time at center of view)
  const timeToScroll = useCallback((hour: number) => {
    return hour * HOUR_H + topPadding - VISIBLE_HEIGHT / 2;
  }, [topPadding]);

  // Convert scroll position to time
  const scrollToTime = useCallback((scrollTop: number) => {
    const centerY = scrollTop + VISIBLE_HEIGHT / 2 - topPadding;
    const hourFloat = centerY / HOUR_H;
    // Snap to 15 minutes
    const snappedHour = Math.floor(hourFloat);
    const snappedMin = Math.round((hourFloat - snappedHour) * 4) * 15;
    const finalMin = snappedMin >= 60 ? 0 : snappedMin;
    const finalHour = Math.max(0, Math.min(23, snappedMin >= 60 ? snappedHour + 1 : snappedHour));
    return { hour: finalHour, min: finalMin };
  }, [topPadding]);

  // Set initial scroll position when opening
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = timeToScroll(selStart);
    }
  }, [open]);

  // Update time on scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { hour, min } = scrollToTime(scrollRef.current.scrollTop);
    onChange(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }, [scrollToTime, onChange]);

  // Close on outside click
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

  const displayText = value
    ? format(new Date(2026, 0, 1, selHour, selMin), 'h:mm a')
    : 'Select time';

  return (
    <div ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full bg-input border border-border/60 rounded-xl px-4 text-left text-base flex items-center gap-3 transition-colors cursor-pointer ${value ? 'text-text-p' : 'text-text-t'}`}
        style={{ height: 48 }}
      >
        <Clock size={16} className="text-text-t shrink-0" />
        {displayText}
      </button>

      {/* Expanded scroll picker */}
      {open && (
        <div className="mt-2 bg-elevated border border-accent/20 rounded-xl shadow-glow overflow-hidden relative">
          {/* Date label */}
          {selectedDate && (
            <div className="text-center text-sm text-text-s font-medium py-2 border-b border-border/30">
              {format(selectedDate, 'EEEE, MMM d')}
            </div>
          )}

          {/* Fixed center preview block */}
          <div
            className="absolute left-12 right-3 z-10 pointer-events-none rounded border-2 border-accent/60"
            style={{
              top: (selectedDate ? 37 : 0) + VISIBLE_HEIGHT / 2 - (duration * HOUR_H) / 2,
              height: Math.max(duration * HOUR_H, 20),
              backgroundColor: 'rgba(74, 222, 128, 0.10)',
            }}
          >
            <div className="text-[10px] text-accent font-medium px-2 py-0.5">
              {format(new Date(2026, 0, 1, selHour, selMin), 'h:mm a')} · {duration}h
            </div>
          </div>

          {/* Scrollable timeline */}
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ height: VISIBLE_HEIGHT }}
            onScroll={handleScroll}
          >
            <div className="relative" style={{ height: totalScrollHeight }}>
              {/* Hour grid */}
              {Array.from({ length: TOTAL_HOURS }, (_, i) => i).map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full flex"
                  style={{ top: topPadding + hour * HOUR_H, height: HOUR_H }}
                >
                  <div className="w-12 text-[10px] text-text-t text-right pr-2 shrink-0" style={{ marginTop: -6 }}>
                    {hour > 0 ? format(new Date(2026, 0, 1, hour), 'h a') : '12 AM'}
                  </div>
                  <div className="flex-1 border-t border-border/15" />
                </div>
              ))}

              {/* Current time red line */}
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

              {/* Existing bookings */}
              {dayBookings.map((booking) => {
                const d = new Date(booking.date);
                const startHour = d.getHours() + d.getMinutes() / 60;
                const top = topPadding + startHour * HOUR_H;
                const height = booking.duration * HOUR_H;
                const client = getClient(booking.client_id ?? '');
                const color = typeColor[booking.type];
                return (
                  <div
                    key={booking.id}
                    className="absolute left-12 right-1 rounded px-2 py-0.5 pointer-events-none overflow-hidden"
                    style={{
                      top,
                      height: Math.max(height, 20),
                      backgroundColor: `${color}20`,
                      borderLeft: `2px solid ${color}`,
                    }}
                  >
                    <div className="text-[10px] text-text-s truncate">
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
