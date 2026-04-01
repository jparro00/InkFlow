import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import ClientForm from '../components/client/ClientForm';

export default function ClientsPage() {
  const navigate = useNavigate();
  const clients = useClientStore((s) => s.clients);
  const bookings = useBookingStore((s) => s.bookings);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const filtered = search
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone?.toLowerCase().includes(search.toLowerCase()) ||
          c.instagram?.toLowerCase().includes(search.toLowerCase())
      )
    : clients;

  const getStats = (clientId: string) => {
    const clientBookings = bookings.filter((b) => b.client_id === clientId);
    const upcoming = clientBookings.filter(
      (b) => new Date(b.date) > new Date() && b.status !== 'Cancelled'
    ).length;
    return { total: clientBookings.length, upcoming };
  };

  return (
    <div className="px-5 pt-6 pb-4 lg:px-6 lg:pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl lg:text-2xl text-text-p">Clients</h1>
        <button
          onClick={() => setShowForm(true)}
          className="w-12 h-12 lg:w-auto lg:h-auto lg:px-4 lg:py-2.5 bg-accent text-bg rounded-xl flex items-center justify-center gap-2 text-sm cursor-pointer press-scale transition-transform"
        >
          <Plus size={20} />
          <span className="hidden lg:inline">New Client</span>
        </button>
      </div>

      {/* Search — sticky on mobile */}
      <div className="sticky top-0 z-10 pb-4 -mx-5 px-5 lg:mx-0 lg:px-0 bg-bg/80 backdrop-blur-xl">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-t" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full bg-surface border border-border/40 rounded-xl pl-12 pr-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      {/* Client list */}
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
              className="w-full text-left flex items-center gap-4 px-4 py-4 lg:px-4 rounded-xl active:bg-elevated/40 lg:hover:bg-elevated/30 transition-colors cursor-pointer group press-scale min-h-[72px]"
            >
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent text-base font-medium shrink-0">
                {client.name.charAt(0)}
              </div>
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
                  {[client.phone, client.instagram].filter(Boolean).join(' · ')}
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

      {showForm && <ClientForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
