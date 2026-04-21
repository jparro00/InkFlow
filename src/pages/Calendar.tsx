import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';
import MonthView from '../components/calendar/MonthView';
import DayView from '../components/calendar/DayView';
import YearView from '../components/calendar/YearView';
import { useUIStore } from '../stores/uiStore';
import { useBookingStore } from '../stores/bookingStore';
import { useClientStore } from '../stores/clientStore';
import { getTypeColor, getBookingLabel } from '../types';
import type { Booking } from '../types';

export default function CalendarPage() {
  const calendarView = useUIStore((s) => s.calendarView);
  const todayHandler = useUIStore((s) => s.todayHandler);
  const calendarSearchOpen = useUIStore((s) => s.calendarSearchOpen);
  const setCalendarSearchOpen = useUIStore((s) => s.setCalendarSearchOpen);
  const setSelectedBookingId = useUIStore((s) => s.setSelectedBookingId);
  const setCalendarDate = useUIStore((s) => s.setCalendarDate);
  const setCalendarView = useUIStore((s) => s.setCalendarView);
  const searchBookings = useBookingStore((s) => s.searchBookings);
  const clients = useClientStore((s) => s.clients);

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear query when search closes
  useEffect(() => {
    if (!calendarSearchOpen) setQuery('');
  }, [calendarSearchOpen]);

  const bookingResults =
    query.length >= 2
      ? searchBookings(query, clients.map((c) => ({ id: c.id, name: c.name })))
      : [];

  const labelFor = (b: Booking) =>
    getBookingLabel(b, clients.find((c) => c.id === b.client_id)?.name);

  return (
    <div className="h-full flex flex-col relative">
      {calendarView === 'year' && <YearView />}
      {calendarView === 'month' && <MonthView />}
      {calendarView === 'day' && <DayView />}

      {/* Search dropdown */}
      {calendarSearchOpen && (
        <div className="absolute top-0 left-0 right-0 z-40 px-3 pt-3 pb-2 bg-bg/95 backdrop-blur-sm border-b border-border/30">
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-t" />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bookings..."
              className="w-full bg-surface border border-border/40 rounded-md pl-10 pr-10 py-3 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors"
            />
            <button
              onClick={() => setCalendarSearchOpen(false)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-text-t active:text-text-s cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Results */}
          {query.length >= 2 && (
            <div className="mt-2 bg-elevated border border-border/40 rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
              {bookingResults.length > 0 ? (
                bookingResults.slice(0, 8).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setCalendarSearchOpen(false);
                      setCalendarDate(new Date(b.date));
                      setCalendarView('day');
                      setTimeout(() => setSelectedBookingId(b.id), 100);
                    }}
                    className="w-full text-left px-4 py-3 active:bg-surface transition-colors cursor-pointer flex items-center gap-3 press-scale border-b border-border/10 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1" style={{ borderLeftWidth: 3, borderLeftColor: getTypeColor(b.type), paddingLeft: 10 }}>
                      <div className="text-[15px] text-text-p truncate">
                        {labelFor(b)} &middot; {b.type}
                      </div>
                      <div className="text-[13px] text-text-t">
                        {format(new Date(b.date), 'MMM d, yyyy · h:mm a')} &middot; {b.status}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-text-t text-sm">No bookings found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Shared Today button — same position across all views.
          Mobile: fixed to viewport so it floats above the tab bar.
          Desktop: absolute inside this Calendar wrapper (which lives inside
          the sidebar-offset main content area), so it anchors past the
          sidebar instead of being hidden behind it. */}
      {todayHandler && (
        <button
          onClick={todayHandler}
          className="fixed lg:absolute bottom-[116px] left-5 lg:left-8 lg:bottom-8 px-4 py-2.5 bg-elevated border border-border/60 text-text-p text-md font-medium rounded-md shadow-md cursor-pointer press-scale transition-all z-30"
        >
          Today
        </button>
      )}
    </div>
  );
}
