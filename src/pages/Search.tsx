import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useUIStore } from '../stores/uiStore';
import { getTypeColor, getBookingLabel } from '../types';
import type { Booking } from '../types';

export default function SearchOverlay() {
  const navigate = useNavigate();
  const { setSearchOpen, setSelectedBookingId } = useUIStore();
  const searchClients = useClientStore((s) => s.searchClients);
  const clients = useClientStore((s) => s.clients);
  const searchBookings = useBookingStore((s) => s.searchBookings);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearchOpen]);

  const clientResults = query.length >= 2 ? searchClients(query) : [];
  const bookingResults =
    query.length >= 2
      ? searchBookings(query, clients.map((c) => ({ id: c.id, name: c.name })))
      : [];

  const labelFor = (b: Booking) =>
    getBookingLabel(b, clients.find((c) => c.id === b.client_id)?.name);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-bg/95 backdrop-blur-sm z-50 flex flex-col"
      onClick={() => setSearchOpen(false)}
    >
      {/* Search input area */}
      <div
        className="px-6 pt-5 pb-2 lg:pt-[15vh] lg:px-0 lg:max-w-[600px] lg:mx-auto lg:w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-t" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, bookings..."
            className="w-full bg-surface border border-border/40 rounded-md pl-12 pr-12 py-4 text-md text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors"
          />
          <button
            onClick={() => setSearchOpen(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full text-text-t active:text-text-s cursor-pointer"
          >
            <X size={22} />
          </button>
        </div>

        {/* Results */}
        {query.length >= 2 && (
          <div className="mt-3 bg-elevated border border-border/40 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
            {clientResults.length > 0 && (
              <div>
                <div className="px-5 py-3 text-xs text-text-t uppercase tracking-wider font-medium bg-surface/50">
                  Clients
                </div>
                {clientResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSearchOpen(false);
                      navigate(`/clients/${c.id}`);
                    }}
                    className="w-full text-left px-5 py-4 active:bg-surface transition-colors cursor-pointer flex items-center gap-4 press-scale min-h-[56px]"
                  >
                    <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-medium shrink-0">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base text-text-p truncate">{c.name}</div>
                      <div className="text-sm text-text-t truncate">
                        {[c.phone, c.instagram].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {bookingResults.length > 0 && (
              <div>
                <div className="px-5 py-3 text-xs text-text-t uppercase tracking-wider font-medium bg-surface/50">
                  Bookings
                </div>
                {bookingResults.slice(0, 10).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setSearchOpen(false);
                      setSelectedBookingId(b.id);
                    }}
                    className="w-full text-left px-5 py-4 active:bg-surface transition-colors cursor-pointer flex items-center gap-4 press-scale min-h-[56px]"
                  >
                    <div className="min-w-0 flex-1" style={{ borderLeftWidth: 3, borderLeftColor: getTypeColor(b.type), paddingLeft: 12 }}>
                      <div className="text-base text-text-p truncate">
                        {labelFor(b)} &middot; {b.type}
                      </div>
                      <div className="text-sm text-text-t">
                        {format(new Date(b.date), 'MMM d, yyyy')} &middot; {b.status}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {clientResults.length === 0 && bookingResults.length === 0 && (
              <div className="px-5 py-12 text-center text-text-t text-sm">No results found.</div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
