import { useState, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { UserPlus, CalendarPlus } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Modal from '../common/Modal';
import CreateClientForm from '../client/CreateClientForm';
import DatePicker from './DatePicker';
import TimePicker from './TimePicker';
import ImagePicker from './ImagePicker';
import ImageThumbnailGrid from './ImageThumbnailGrid';
import ImageViewer from './ImageViewer';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useImageStore } from '../../stores/imageStore';
import { useBookingImages } from '../../hooks/useBookingImages';
import type { Booking, BookingType, BookingStatus } from '../../types';
import { getTypeColor } from '../../types';
import { exportBookingToCalendar } from '../../utils/calendar';

// Flip to false to hide the "Add to iOS" calendar button
const ENABLE_IOS_CALENDAR = true;

const bookingTypes: BookingType[] = ['Regular', 'Touch Up', 'Consultation', 'Full Day', 'Cover Up', 'Personal'];

const typeDuration: Record<BookingType, number> = {
  Regular: 3,
  'Touch Up': 1,
  Consultation: 1,
  'Full Day': 3,
  'Cover Up': 3,
  Personal: 1,
};

const TITLE_MAX = 30;

const defaultForm = {
  client_id: '',
  date: '',
  time: '10:00',
  duration: 3,
  type: 'Regular' as BookingType,
  estimate: '',
  status: 'Confirmed' as BookingStatus,
  rescheduled: false,
  notes: '',
  title: '',
};

export default function BookingForm() {
  const { editingBookingId, closeBookingForm, prefillBookingData } = useUIStore();
  const booking = useBookingStore((s) => editingBookingId ? s.bookings.find((b) => b.id === editingBookingId) : undefined);
  const addBooking = useBookingStore((s) => s.addBooking);
  const updateBooking = useBookingStore((s) => s.updateBooking);
  const clients = useClientStore((s) => s.clients);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  // Track fields NOT populated by AI — shown with red outlines
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());

  const tempBookingId = useRef(crypto.randomUUID());
  const morningRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef<HTMLDivElement>(null);
  const timePickerOpen = useRef(false);
  const excludeRefs = useRef([morningRef, durationRef]);
  const initialFormRef = useRef<typeof defaultForm | null>(null);
  const imageBookingId = editingBookingId ?? tempBookingId.current;
  const { thumbnails, addImages, removeImage, getOriginalUrl } = useBookingImages(imageBookingId);
  const remapBookingImages = useImageStore((s) => s.remapBookingImages);

  useEffect(() => {
    if (booking) {
      const d = new Date(booking.date);
      // Original booking values — used as the baseline for dirty detection
      const originalData = {
        client_id: booking.client_id ?? '',
        date: format(d, 'yyyy-MM-dd'),
        time: format(d, 'HH:mm'),
        duration: booking.duration,
        type: booking.type,
        estimate: booking.estimate?.toString() ?? '',
        status: booking.status,
        rescheduled: booking.rescheduled ?? false,
        notes: booking.notes ?? '',
        title: booking.title ?? '',
      };

      // Start with original data, then overlay any agent edit changes
      const formData = { ...originalData };
      if (prefillBookingData) {
        if (prefillBookingData.date) {
          // Parse ISO string directly to avoid UTC→local timezone shift
          // (new Date("2026-04-23") treats date-only as UTC midnight, which
          // shifts back a day in western timezones)
          const [datePart, timePart] = String(prefillBookingData.date).split('T');
          formData.date = datePart;
          if (timePart) formData.time = timePart.slice(0, 5);
          // If no time in ISO string, keep the existing booking's time
        }
        if (prefillBookingData.client_id) formData.client_id = prefillBookingData.client_id;
        if (prefillBookingData.type) formData.type = prefillBookingData.type as BookingType;
        if (prefillBookingData.duration) formData.duration = prefillBookingData.duration;
        if (prefillBookingData.estimate) formData.estimate = prefillBookingData.estimate.toString();
        if (prefillBookingData.rescheduled !== undefined) formData.rescheduled = prefillBookingData.rescheduled;
        if (prefillBookingData.timeSlot) {
          formData.time = prefillBookingData.timeSlot === 'morning'
            ? (localStorage.getItem('inkbloop-morning-time') ?? '10:00')
            : (localStorage.getItem('inkbloop-evening-time') ?? '14:00');
        }
        if (prefillBookingData.notes) formData.notes = prefillBookingData.notes;
        if (prefillBookingData.title) formData.title = prefillBookingData.title.slice(0, TITLE_MAX);
      }

      setForm(formData);
      // Store original (pre-agent) values so form is dirty when agent made changes
      if (!initialFormRef.current) initialFormRef.current = originalData;
      const displayClient = prefillBookingData?.client_id
        ? clients.find((c) => c.id === prefillBookingData.client_id)
        : clients.find((c) => c.id === booking.client_id);
      if (displayClient) setClientSearch(displayClient.name);
    } else if (prefillBookingData) {
      const updates: Partial<typeof defaultForm> = {};
      if (prefillBookingData.date) {
        // Parse ISO string directly to avoid UTC→local timezone shift
        const [datePart, timePart] = String(prefillBookingData.date).split('T');
        updates.date = datePart;
        if (timePart) updates.time = timePart.slice(0, 5);
      }
      if (prefillBookingData.client_id) {
        updates.client_id = prefillBookingData.client_id;
        const c = clients.find((c) => c.id === prefillBookingData.client_id);
        if (c) setClientSearch(c.name);
      }
      if (prefillBookingData.type) updates.type = prefillBookingData.type as BookingType;
      if (prefillBookingData.duration) updates.duration = prefillBookingData.duration;
      if (prefillBookingData.estimate) updates.estimate = prefillBookingData.estimate.toString();
      if (prefillBookingData.rescheduled) updates.rescheduled = true;
      if (prefillBookingData.timeSlot) {
        const slotTime = prefillBookingData.timeSlot === 'morning'
          ? (localStorage.getItem('inkbloop-morning-time') ?? '10:00')
          : (localStorage.getItem('inkbloop-evening-time') ?? '14:00');
        updates.time = slotTime;
      }
      if (prefillBookingData.notes) updates.notes = prefillBookingData.notes;
      if (prefillBookingData.title) updates.title = prefillBookingData.title.slice(0, TITLE_MAX);
      // If type was set but duration wasn't explicitly provided, use type default
      const typeKey = updates.type ?? defaultForm.type;
      if (!prefillBookingData.duration && typeDuration[typeKey]) {
        updates.duration = typeDuration[typeKey];
      }
      const initialWithUpdates = { ...defaultForm, ...updates } as typeof defaultForm;
      setForm((f) => ({ ...f, ...updates }));
      if (!initialFormRef.current) initialFormRef.current = initialWithUpdates;

      // Track which fields the AI didn't populate (only for AI-sourced prefills with multiple fields)
      const hasMultipleFields = Object.keys(prefillBookingData).length > 1;
      if (hasMultipleFields) {
        const missing = new Set<string>();
        const isPersonal = updates.type === 'Personal';
        if (isPersonal) {
          if (!prefillBookingData.title) missing.add('title');
        } else {
          if (!prefillBookingData.client_id) missing.add('client');
        }
        if (!prefillBookingData.date) missing.add('date');
        if (!prefillBookingData.type) missing.add('type');
        if (!prefillBookingData.estimate) missing.add('estimate');
        setMissingFields(missing);
      }
    } else {
      if (!initialFormRef.current) initialFormRef.current = { ...defaultForm };
    }
  }, [booking, prefillBookingData, clients]);

  const dirty = useMemo(() => {
    if (!initialFormRef.current) return false;
    return JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  }, [form]);

  const filteredClients = clientSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  const handleSave = async () => {
    const dateTime = new Date(`${form.date}T${form.time}`);
    const isPersonal = form.type === 'Personal';
    const data: Omit<Booking, 'id' | 'created_at'> = {
      client_id: isPersonal ? null : (form.client_id || null),
      date: dateTime.toISOString(),
      duration: form.duration,
      type: form.type,
      estimate: form.estimate ? parseFloat(form.estimate) : undefined,
      status: form.status,
      rescheduled: form.rescheduled || undefined,
      notes: form.notes || undefined,
      title: isPersonal ? (form.title.trim() || undefined) : undefined,
    };

    try {
      if (editingBookingId) {
        await updateBooking(editingBookingId, data);
      } else {
        const newBooking = await addBooking(data, tempBookingId.current);
        remapBookingImages(tempBookingId.current, newBooking.id);
      }
      closeBookingForm();
    } catch (e) {
      console.error('Failed to save booking:', e);
    }
  };

  const isValid = form.date && (form.type === 'Personal' ? form.title.trim().length > 0 : !!form.client_id);

  const changedBookingFields = useUIStore((s) => s.changedBookingFields);
  const inputClass = "w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";
  const missingInputClass = "w-full bg-input border-2 border-danger/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-danger/40 transition-colors min-h-[48px]";
  const changedInputClass = "w-full bg-input border-2 border-accent/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]";
  const labelClass = "text-sm text-text-t uppercase tracking-wider mb-2 block font-medium";
  const inputFor = (field: string) =>
    missingFields.has(field) ? missingInputClass :
    changedBookingFields.has(field) ? changedInputClass :
    inputClass;
  const changedLabel = (field: string) =>
    changedBookingFields.has(field) ? (
      <span className="text-xs text-accent ml-2 font-normal normal-case tracking-normal">AI updated</span>
    ) : null;

  return (
    <>
    <Modal
      title={editingBookingId ? 'Edit Booking' : 'New Booking'}
      onClose={closeBookingForm}
      canCollapse={dirty}
    >
      <div className="space-y-6">
        {/* Client or Title (Personal bookings use a free-text title instead of a client) */}
        {form.type === 'Personal' ? (
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-t uppercase tracking-wider font-medium">Title *{changedLabel('title')}</label>
              <span className="text-xs text-text-t">{form.title.length}/{TITLE_MAX}</span>
            </div>
            <input
              type="text"
              value={form.title}
              onChange={(e) => {
                const v = e.target.value.slice(0, TITLE_MAX);
                setForm((f) => ({ ...f, title: v }));
                if (v.trim()) setMissingFields((s) => { const n = new Set(s); n.delete('title'); return n; });
              }}
              onFocus={() => setMissingFields((s) => { const n = new Set(s); n.delete('title'); return n; })}
              maxLength={TITLE_MAX}
              placeholder="e.g. Dentist, Gym, Lunch"
              className={inputFor('title')}
            />
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-t uppercase tracking-wider font-medium">Client *{changedLabel('client')}</label>
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
              onFocus={() => { setShowClientDropdown(true); setMissingFields((s) => { const n = new Set(s); n.delete('client'); return n; }); }}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
              placeholder="Search client..."
              className={inputFor('client')}
            />
            {showClientDropdown && filteredClients.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-border/60 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setForm((f) => ({ ...f, client_id: c.id }));
                      setClientSearch(c.name);
                      setShowClientDropdown(false);
                    }}
                    className="w-full text-left px-4 py-4 text-base text-text-p active:bg-surface transition-colors cursor-pointer first:rounded-t-lg last:rounded-b-lg min-h-[48px]"
                  >
                    {c.name}
                    {c.phone && <span className="text-text-t ml-2 text-sm">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Date */}
        <div>
          <label className={labelClass}>Date *{changedLabel('date')}</label>
          <DatePicker
            value={form.date}
            onChange={(date) => { setForm((f) => ({ ...f, date })); setMissingFields((s) => { const n = new Set(s); n.delete('date'); return n; }); }}
            missing={missingFields.has('date')}
          />
        </div>

        {/* Morning / Evening */}
        <div ref={morningRef} className="flex gap-3 mt-2" style={{ scrollMarginTop: 12 }}>
          {['Morning', 'Evening'].map((slot) => {
            const time = slot === 'Morning'
              ? (localStorage.getItem('inkbloop-morning-time') ?? '10:00')
              : (localStorage.getItem('inkbloop-evening-time') ?? '14:00');
            const isActive = form.time === time;
            const [h, m] = time.split(':').map(Number);
            const label = format(new Date(2026, 0, 1, h, m), 'h:mm a');
            return (
              <button
                key={slot}
                type="button"
                onClick={() => setForm((f) => ({ ...f, time }))}
                className={`flex-1 px-4 py-3 text-sm rounded-md border transition-all cursor-pointer press-scale min-h-[44px] ${
                  isActive
                    ? 'border-accent/60 text-accent bg-accent/8'
                    : 'border-border/60 text-text-s active:text-text-p active:bg-elevated'
                }`}
              >
                {slot} · {label}
              </button>
            );
          })}
        </div>

        {/* Duration */}
        <div ref={durationRef}>
          <label className={labelClass}>Duration{changedLabel('duration')}</label>
          <select
            value={form.duration}
            onChange={(e) => setForm((f) => ({ ...f, duration: parseFloat(e.target.value) }))}
            className="w-full bg-input border border-border/60 rounded-md px-4 text-base text-text-p focus:outline-none focus:border-accent/40 transition-colors cursor-pointer"
            style={{ height: 48, boxSizing: 'border-box' }}
          >
            {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8].map((d) => (
              <option key={d} value={d}>{d}h</option>
            ))}
          </select>
        </div>

        {/* Time */}
        <div ref={timeRef}>
          <label className={labelClass}>Time{changedLabel('timeSlot')}</label>
          <TimePicker
            value={form.time}
            onChange={(time) => setForm((f) => ({ ...f, time }))}
            date={form.date}
            duration={form.duration}
            bookingType={form.type}
            editingBookingId={editingBookingId ?? undefined}
            onOpenChange={(isOpen) => {
              timePickerOpen.current = isOpen;
              if (!isOpen) return;
              requestAnimationFrame(() => {
                const morningEl = morningRef.current;
                const timeEl = timeRef.current;
                if (!morningEl || !timeEl) return;
                const morningRect = morningEl.getBoundingClientRect();
                if (morningRect.top > 0) {
                  // Morning/Evening is below viewport top — scroll down to put it at top
                  morningEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                  // Morning/Evening already above — just ensure time section is visible
                  timeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
              });
            }}
            excludeRefs={excludeRefs.current}
            onCylinderChange={(cylOpen) => {
              if (cylOpen && timeRef.current) {
                requestAnimationFrame(() => {
                  timeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
              }
            }}
          />
        </div>

        {/* Type */}
        <div>
          <label className={labelClass}>Type{changedLabel('type')}</label>
          <div className="grid grid-cols-2 gap-3">
            {bookingTypes.map((t) => {
              const color = getTypeColor(t);
              const selected = form.type === t;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setForm((f) => {
                      const switchingToPersonal = t === 'Personal' && f.type !== 'Personal';
                      const switchingFromPersonal = t !== 'Personal' && f.type === 'Personal';
                      return {
                        ...f,
                        type: t,
                        duration: typeDuration[t],
                        // Switching to Personal: drop any client association so the row is unlinked.
                        client_id: switchingToPersonal ? '' : f.client_id,
                        // Switching away from Personal: discard the title so it doesn't persist on client bookings.
                        title: switchingFromPersonal ? '' : f.title,
                      };
                    });
                    if (t === 'Personal') setClientSearch('');
                    setMissingFields((s) => {
                      const n = new Set(s);
                      n.delete('type');
                      // The required field swaps — clear the now-irrelevant "missing" flag.
                      if (t === 'Personal') n.delete('client'); else n.delete('title');
                      return n;
                    });
                  }}
                  className={`px-4 py-3.5 text-base rounded-md transition-all cursor-pointer press-scale min-h-[48px] flex items-center gap-2.5 ${
                    selected
                      ? 'border border-border/60 text-text-p bg-text-p/[0.06]'
                      : missingFields.has('type')
                        ? 'border-2 border-danger/60 text-text-s'
                        : 'border border-border/60 text-text-s active:text-text-p active:bg-elevated'
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
          <label className={labelClass}>Estimate ($){changedLabel('estimate')}</label>
          <input
            type="text"
            inputMode="decimal"
            value={form.estimate}
            onChange={(e) => { setForm((f) => ({ ...f, estimate: e.target.value.replace(/[^0-9.]/g, '') })); setMissingFields((s) => { const n = new Set(s); n.delete('estimate'); return n; }); }}
            placeholder="0"
            className={inputFor('estimate')}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes{changedLabel('notes')}</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Additional notes..."
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Rescheduled */}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, rescheduled: !f.rescheduled }))}
          className={`flex items-center gap-3 w-full text-left py-1 cursor-pointer press-scale min-h-[44px] transition-colors ${form.rescheduled ? 'text-danger' : 'text-text-s'}`}
        >
          <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${form.rescheduled ? 'border-danger bg-danger/20' : 'border-border'}`}>
            {form.rescheduled && <span className="text-danger text-xs font-bold">✓</span>}
          </span>
          <span className="text-base">Rescheduled</span>
        </button>

        {/* Reference Images */}
        <div>
          <label className={labelClass}>Reference Images</label>
          <ImageThumbnailGrid
            thumbnails={thumbnails}
            editable
            onRemove={removeImage}
            onView={(id) => setViewingImageId(id)}
          />
          <ImagePicker onFiles={addImages} />
        </div>

        {/* Add to iOS / Save */}
        <div className="flex flex-col lg:flex-row lg:justify-end gap-3 pt-4 border-t border-border/40 sticky bottom-0 bg-elevated pb-2">
          <button
            onClick={closeBookingForm}
            className="hidden lg:block px-4 py-2.5 text-sm text-text-s hover:text-text-p transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {ENABLE_IOS_CALENDAR && (
            <button
              onClick={() => {
                const dateTime = new Date(`${form.date}T${form.time}`);
                const isPersonal = form.type === 'Personal';
                const label = isPersonal
                  ? (form.title.trim() || 'Personal')
                  : (clients.find((c) => c.id === form.client_id)?.name ?? 'Walk-in');
                exportBookingToCalendar(
                  {
                    id: editingBookingId ?? tempBookingId.current,
                    created_at: '',
                    client_id: isPersonal ? null : (form.client_id || null),
                    date: dateTime.toISOString(),
                    duration: form.duration,
                    type: form.type,
                    status: form.status,
                    title: isPersonal ? form.title.trim() : undefined,
                  } as Booking,
                  label,
                );
              }}
              disabled={!isValid}
              className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-4 lg:py-2.5 text-base bg-surface border border-accent/60 text-accent rounded-md font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[52px]"
            >
              <CalendarPlus size={18} />
              Add to iOS
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="w-full lg:w-auto px-6 py-4 lg:py-2.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong min-h-[52px]"
          >
            {editingBookingId ? 'Update Booking' : 'Save Booking'}
          </button>
        </div>
      </div>
    </Modal>

    <AnimatePresence>
      {viewingImageId && (
        <ImageViewer
          thumbnails={thumbnails}
          initialId={viewingImageId}
          getOriginalUrl={getOriginalUrl}
          onClose={() => setViewingImageId(null)}
        />
      )}
    </AnimatePresence>

    {showNewClient && (
      <CreateClientForm
        onClose={() => {
          const currentClients = useClientStore.getState().clients;
          // Only auto-select if a new client was actually added
          if (currentClients.length > clients.length) {
            const latest = currentClients[0]; // Optimistic insert prepends
            setForm((f) => ({ ...f, client_id: latest.id }));
            setClientSearch(latest.name);
          }
          setShowNewClient(false);
        }}
      />
    )}
    </>
  );
}
