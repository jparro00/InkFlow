import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import Modal from '../common/Modal';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import type { Booking, BookingType, BookingStatus, DepositStatus, TattooSize, ColorMode } from '../../types';

const bookingTypes: BookingType[] = ['Consultation', 'New Tattoo', 'Touch-up', 'Cover-up'];
const sizes: TattooSize[] = ['S', 'M', 'L', 'XL'];
const colorModes: ColorMode[] = ['B&G', 'Color'];
const depositStatuses: DepositStatus[] = ['Paid', 'Unpaid', 'Waived'];
const statuses: BookingStatus[] = ['Confirmed', 'Tentative', 'Completed', 'Cancelled', 'No-show'];

const defaultForm = {
  client_id: '',
  date: '',
  time: '10:00',
  duration: 2,
  type: 'New Tattoo' as BookingType,
  style: '',
  placement: '',
  size: '' as TattooSize | '',
  color_mode: '' as ColorMode | '',
  deposit: '',
  deposit_paid: 'Unpaid' as DepositStatus,
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
        style: booking.style ?? '',
        placement: booking.placement ?? '',
        size: booking.size ?? '',
        color_mode: booking.color_mode ?? '',
        deposit: booking.deposit?.toString() ?? '',
        deposit_paid: booking.deposit_paid ?? 'Unpaid',
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
      if (prefillBookingData.style) updates.style = prefillBookingData.style;
      if (prefillBookingData.placement) updates.placement = prefillBookingData.placement;
      if (prefillBookingData.color_mode) updates.color_mode = prefillBookingData.color_mode as ColorMode;
      if (prefillBookingData.size) updates.size = prefillBookingData.size as TattooSize;
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
      style: form.style || undefined,
      placement: form.placement || undefined,
      size: (form.size as TattooSize) || undefined,
      color_mode: (form.color_mode as ColorMode) || undefined,
      deposit: form.deposit ? parseFloat(form.deposit) : undefined,
      deposit_paid: form.deposit ? form.deposit_paid : undefined,
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
    <Modal
      title={editingBookingId ? 'Edit Booking' : 'New Booking'}
      onClose={closeBookingForm}
    >
      <div className="space-y-6">
        {/* Client */}
        <div className="relative">
          <label className={labelClass}>Client *</label>
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
                  {c.phone && <span className="text-text-t ml-2 text-xs">{c.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date / Time / Duration — stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={`${inputClass} [color-scheme:dark]`}
            />
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
          <div>
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
            {bookingTypes.map((t) => (
              <button
                key={t}
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`px-4 py-3.5 text-base rounded-xl border transition-all cursor-pointer press-scale min-h-[48px] ${
                  form.type === t
                    ? 'border-accent/60 text-accent bg-accent/8 shadow-glow'
                    : 'border-border/60 text-text-s active:text-text-p active:bg-elevated'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* Style / Placement */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Style</label>
            <input
              type="text"
              value={form.style}
              onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))}
              placeholder="e.g. Traditional"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Placement</label>
            <input
              type="text"
              value={form.placement}
              onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}
              placeholder="e.g. left wrist"
              className={inputClass}
            />
          </div>
        </div>

        {/* Size / Color */}
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Size</label>
            <div className="flex gap-2">
              {sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => setForm((f) => ({ ...f, size: f.size === s ? '' : s }))}
                  className={`flex-1 py-3.5 text-base rounded-xl border transition-all cursor-pointer press-scale min-h-[48px] ${
                    form.size === s
                      ? 'border-accent/60 text-accent bg-accent/8'
                      : 'border-border/60 text-text-s'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Color</label>
            <div className="flex gap-2">
              {colorModes.map((cm) => (
                <button
                  key={cm}
                  onClick={() => setForm((f) => ({ ...f, color_mode: f.color_mode === cm ? '' : cm }))}
                  className={`flex-1 py-3.5 text-base rounded-xl border transition-all cursor-pointer press-scale min-h-[48px] ${
                    form.color_mode === cm
                      ? 'border-accent/60 text-accent bg-accent/8'
                      : 'border-border/60 text-text-s'
                  }`}
                >
                  {cm}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* Financials */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Deposit ($)</label>
            <input
              type="number"
              value={form.deposit}
              onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value }))}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Deposit Status</label>
            <div className="flex gap-2">
              {depositStatuses.map((ds) => (
                <button
                  key={ds}
                  onClick={() => setForm((f) => ({ ...f, deposit_paid: ds }))}
                  className={`flex-1 py-3.5 text-base rounded-xl border transition-all cursor-pointer press-scale min-h-[48px] ${
                    form.deposit_paid === ds
                      ? 'border-accent/60 text-accent bg-accent/8'
                      : 'border-border/60 text-text-s'
                  }`}
                >
                  {ds}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Estimate ($)</label>
          <input
            type="number"
            value={form.estimate}
            onChange={(e) => setForm((f) => ({ ...f, estimate: e.target.value }))}
            placeholder="0"
            className={inputClass}
          />
        </div>

        <div className="h-px bg-border/40" />

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

        {/* Status */}
        <div>
          <label className={labelClass}>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BookingStatus }))}
            className={`${inputClass} cursor-pointer`}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Save — full width on mobile, sticky */}
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
  );
}
