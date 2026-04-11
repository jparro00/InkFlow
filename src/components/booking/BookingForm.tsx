import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, UserPlus } from 'lucide-react';
import Modal from '../common/Modal';
import ClientForm from '../client/ClientForm';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { Booking, BookingType, BookingStatus } from '../../types';
import { typeColor } from '../../types';

const bookingTypes: BookingType[] = ['Regular', 'Touch Up', 'Consultation', 'Full Day'];

const typeDuration: Record<BookingType, number> = {
  Regular: 3,
  'Touch Up': 1,
  Consultation: 1,
  'Full Day': 3,
};

const defaultForm = {
  client_id: '',
  date: '',
  time: '10:00',
  duration: 3,
  type: 'Regular' as BookingType,
  estimate: '',
  status: 'Confirmed' as BookingStatus,
  notes: '',
};

export default function BookingForm() {
  const { editingBookingId, closeBookingForm, prefillBookingData } = useUIStore();
  const booking = useBookingStore((s) => editingBookingId ? s.getBooking(editingBookingId) : undefined);
  const addBooking = useBookingStore((s) => s.addBooking);
  const updateBooking = useBookingStore((s) => s.updateBooking);
  const clients = useClientStore((s) => s.clients);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (booking) {
      const d = new Date(booking.date);
      setForm({
        client_id: booking.client_id ?? '',
        date: format(d, 'yyyy-MM-dd'),
        time: format(d, 'HH:mm'),
        duration: booking.duration,
        type: booking.type,
        estimate: booking.estimate?.toString() ?? '',
        status: booking.status,
        notes: booking.notes ?? '',
      });
      const c = clients.find((c) => c.id === booking.client_id);
      if (c) setClientSearch(c.name);
    } else if (prefillBookingData) {
      const updates: Partial<typeof defaultForm> = {};
      if (prefillBookingData.date) {
        const d = new Date(prefillBookingData.date);
        updates.date = format(d, 'yyyy-MM-dd');
        updates.time = format(d, 'HH:mm');
      }
      if (prefillBookingData.client_id) {
        updates.client_id = prefillBookingData.client_id;
        const c = clients.find((c) => c.id === prefillBookingData.client_id);
        if (c) setClientSearch(c.name);
      }
      if (prefillBookingData.duration) updates.duration = prefillBookingData.duration;
      if (prefillBookingData.type) updates.type = prefillBookingData.type as BookingType;
      setForm((f) => ({ ...f, ...updates }));
    }
  }, [booking, prefillBookingData, clients]);

  const filteredClients = clientSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  const handleSave = () => {
    const dateTime = new Date(`${form.date}T${form.time}`);
    const data: Omit<Booking, 'id' | 'created_at'> = {
      client_id: form.client_id || null,
      date: dateTime.toISOString(),
      duration: form.duration,
      type: form.type,
      estimate: form.estimate ? parseFloat(form.estimate) : undefined,
      status: form.status,
      notes: form.notes || undefined,
    };

    if (editingBookingId) {
      updateBooking(editingBookingId, data);
    } else {
      addBooking(data);
    }
    closeBookingForm();
  };

  const isValid = form.date && form.client_id;

  const inputClass = "w-full bg-input border border-border/60 rounded-xl px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";
  const labelClass = "text-sm text-text-t uppercase tracking-wider mb-2 block font-medium";

  return (
    <>
    <Modal
      title={editingBookingId ? 'Edit Booking' : 'New Booking'}
      onClose={closeBookingForm}
    >
      <div className="space-y-6">
        {/* Client */}
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-text-t uppercase tracking-wider font-medium">Client *</label>
            <button
              onClick={() => setShowNewClient(true)}
              className="flex items-center gap-1.5 text-sm text-accent active:text-accent-dim transition-colors cursor-pointer press-scale"
            >
              <UserPlus size={14} />
              <span>New Client</span>
            </button>
          </div>
          <input
            type="text"
            value={clientSearch}
            onChange={(e) => {
              setClientSearch(e.target.value);
              setShowClientDropdown(true);
              if (!e.target.value) setForm((f) => ({ ...f, client_id: '' }));
            }}
            onFocus={() => setShowClientDropdown(true)}
            placeholder="Search client..."
            className={inputClass}
          />
          {showClientDropdown && filteredClients.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-border/60 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setForm((f) => ({ ...f, client_id: c.id }));
                    setClientSearch(c.name);
                    setShowClientDropdown(false);
                  }}
                  className="w-full text-left px-4 py-4 text-base text-text-p active:bg-surface transition-colors cursor-pointer first:rounded-t-xl last:rounded-b-xl min-h-[48px]"
                >
                  {c.name}
                  {c.phone && <span className="text-text-t ml-2 text-sm">{c.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date / Time / Duration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Date *</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-t pointer-events-none" />
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={`${inputClass} pl-10 [color-scheme:dark]`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Time</label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Duration</label>
            <select
              value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: parseFloat(e.target.value) }))}
              className={`${inputClass} cursor-pointer`}
            >
              {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8].map((d) => (
                <option key={d} value={d}>{d}h</option>
              ))}
            </select>
          </div>
        </div>

        {/* Type */}
        <div>
          <label className={labelClass}>Type</label>
          <div className="grid grid-cols-2 gap-3">
            {bookingTypes.map((t) => {
              const color = typeColor[t];
              const selected = form.type === t;
              return (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t, duration: typeDuration[t] }))}
                  className={`px-4 py-3.5 text-base rounded-xl border transition-all cursor-pointer press-scale min-h-[48px] flex items-center gap-2.5 ${
                    selected
                      ? 'border-border/60 text-text-p bg-white/[0.06]'
                      : 'border-border/60 text-text-s active:text-text-p active:bg-elevated'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* Estimate */}
        <div>
          <label className={labelClass}>Estimate ($)</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.estimate}
            onChange={(e) => setForm((f) => ({ ...f, estimate: e.target.value.replace(/[^0-9.]/g, '') }))}
            placeholder="0"
            className={inputClass}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Additional notes..."
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Save */}
        <div className="flex flex-col lg:flex-row lg:justify-end gap-3 pt-4 border-t border-border/40 sticky bottom-0 bg-elevated pb-2">
          <button
            onClick={closeBookingForm}
            className="hidden lg:block px-4 py-2.5 text-sm text-text-s hover:text-text-p transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="w-full lg:w-auto px-6 py-4 lg:py-2.5 text-base bg-accent text-bg rounded-xl font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed active:shadow-glow min-h-[52px]"
          >
            {editingBookingId ? 'Update Booking' : 'Save Booking'}
          </button>
        </div>
      </div>
    </Modal>

    {showNewClient && (
      <ClientForm
        onClose={() => {
          setShowNewClient(false);
          // Auto-select the most recently added client
          const latest = useClientStore.getState().clients[useClientStore.getState().clients.length - 1];
          if (latest) {
            setForm((f) => ({ ...f, client_id: latest.id }));
            setClientSearch(latest.name);
          }
        }}
      />
    )}
    </>
  );
}
