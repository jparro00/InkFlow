import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useUIStore } from '../stores/uiStore';
export default function ClientsPage() {
  const navigate = useNavigate();
  const clients = useClientStore((s) => s.clients);
  const linkedProfiles = useClientStore((s) => s.linkedProfiles);
  const bookings = useBookingStore((s) => s.bookings);
  const [search, setSearch] = useState('');
  const { setHeaderLeft, setHeaderRight, setCreateClientFormOpen } = useUIStore();

  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));

  const filtered = search
    ? sorted.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          (c.instagram && linkedProfiles[c.instagram]?.name?.toLowerCase().includes(q)) ||
          (c.facebook && linkedProfiles[c.facebook]?.name?.toLowerCase().includes(q))
        );
      })
    : sorted;

  const getStats = (clientId: string) => {
    const clientBookings = bookings.filter((b) => b.client_id === clientId);
    const upcoming = clientBookings.filter(
      (b) => new Date(b.date) > new Date() && b.status !== 'Cancelled'
    ).length;
    return { total: clientBookings.length, upcoming };
  };

  // Register header buttons
  useEffect(() => {
    setHeaderLeft(null);
    setHeaderRight(
      <button
        onClick={() => setCreateClientFormOpen(true)}
        className="w-12 h-12 lg:w-auto lg:h-auto lg:px-4 lg:py-2.5 bg-accent text-bg rounded-md flex items-center justify-center gap-2 text-sm cursor-pointer press-scale transition-transform shadow-glow active:shadow-glow-strong"
      >
        <Plus size={20} />
        <span className="hidden lg:inline">New Client</span>
      </button>
    );
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [setHeaderLeft, setHeaderRight]);

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-t" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full bg-surface border border-border/40 rounded-md pl-12 pr-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      {/* Scrollable client list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 lg:px-6">
        <div className="space-y-1">
          {filtered.map((client, i) => {
            const stats = getStats(client.id);
            return (
              <motion.button
                key={client.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="w-full text-left flex items-center gap-4 px-5 py-4 lg:px-4 rounded-lg active:bg-elevated/40 lg:hover:bg-elevated/30 transition-colors cursor-pointer group press-scale min-h-[72px]"
              >
                {(() => {
                  const pic = client.profile_pic
                    || (client.instagram && linkedProfiles[client.instagram]?.profilePic)
                    || (client.facebook && linkedProfiles[client.facebook]?.profilePic);
                  return pic ? (
                    <img src={pic} alt={client.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent text-base font-medium shrink-0">
                      {client.name.charAt(0)}
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base text-text-p font-medium truncate">{client.name}</span>
                    {stats.upcoming > 0 && (
                      <span className="text-xs text-accent bg-accent/8 px-2 py-1 rounded-md shrink-0">
                        {stats.upcoming} upcoming
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-text-s mt-1 truncate">
                    {[
                      client.phone,
                      client.instagram && linkedProfiles[client.instagram]?.name,
                      client.facebook && linkedProfiles[client.facebook]?.name,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="hidden lg:flex gap-1.5">
                  {client.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 text-xs rounded-md bg-surface text-text-t border border-border/40"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.button>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-text-t text-sm">
              {search ? 'No clients match your search.' : 'No clients yet.'}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
