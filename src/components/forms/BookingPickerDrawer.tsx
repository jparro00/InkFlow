import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { CalendarIcon, Search, Plus } from 'lucide-react';
import Modal from '../common/Modal';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useUIStore } from '../../stores/uiStore';
import { getBookingLabel, type Booking } from '../../types';

interface Props {
  open: boolean;
  /** ID of the consent submission being approved. Required so "Create new booking" can hand off via uiStore. */
  submissionId?: string;
  /** Pre-fill seed for create-new-booking flow (typically license_first_name + license_last_name). */
  prefillName?: string;
  onClose: () => void;
  /** Called when the artist taps an existing booking. The detail page approves the submission. */
  onPick: (bookingId: string) => void | Promise<void>;
  busy?: boolean;
}

export default function BookingPickerDrawer({
  open,
  submissionId,
  prefillName,
  onClose,
  onPick,
  busy,
}: Props) {
  if (!open) return null;
  return (
    <Modal title="Attach to booking" onClose={onClose}>
      <BookingPickerBody
        submissionId={submissionId}
        prefillName={prefillName}
        onClose={onClose}
        onPick={onPick}
        busy={busy}
      />
    </Modal>
  );
}

function BookingPickerBody({
  submissionId,
  prefillName,
  onClose,
  onPick,
  busy,
}: Omit<Props, 'open'>) {
  const allBookings = useBookingStore((s) => s.bookings);
  const searchBookings = useBookingStore((s) => s.searchBookings);
  const clients = useClientStore((s) => s.clients);
  const openBookingForm = useUIStore((s) => s.openBookingForm);
  const setPendingConsentSubmissionId = useUIStore((s) => s.setPendingConsentSubmissionId);
  const setPrefillClientData = useUIStore((s) => s.setPrefillClientData);

  const today = useMemo(() => new Date(), []);
  const [query, setQuery] = useState('');

  const todaysBookings = useMemo<Booking[]>(() => {
    return allBookings
      .filter((b) => isSameDay(new Date(b.date), today))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allBookings, today]);

  const searchResults = useMemo<Booking[]>(() => {
    if (!query.trim()) return [];
    return searchBookings(query.trim(), clients)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);
  }, [query, searchBookings, clients]);

  const renderBookingRow = (b: Booking) => {
    const clientName = b.client_id
      ? clients.find((c) => c.id === b.client_id)?.name
      : undefined;
    const dateText = isSameDay(new Date(b.date), today)
      ? format(new Date(b.date), 'p')
      : format(new Date(b.date), 'MMM d, p');
    return (
      <button
        key={b.id}
        onClick={() => onPick(b.id)}
        disabled={busy}
        className="w-full bg-surface/60 rounded-lg border border-border/30 px-4 py-3.5 flex items-center justify-between cursor-pointer press-scale transition-all active:bg-elevated/40 text-left disabled:opacity-40"
      >
        <div className="min-w-0 flex-1">
          <div className="text-base text-text-p truncate">
            {getBookingLabel(b, clientName)}
          </div>
          <div className="text-sm text-text-t mt-0.5">
            {dateText} · {b.type}
          </div>
        </div>
        <CalendarIcon size={18} className="text-text-t shrink-0 ml-3" />
      </button>
    );
  };

  const handleCreateNew = () => {
    if (!submissionId) return;
    setPendingConsentSubmissionId(submissionId);
    if (prefillName) {
      setPrefillClientData({ name: prefillName });
    }
    onClose();
    openBookingForm();
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-t">
        Pick a booking to attach this consent form to, or create a new one.
      </p>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-t pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by client, type, notes…"
          className="w-full bg-input border border-border/60 rounded-md pl-10 pr-4 py-3 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[44px]"
        />
      </div>

      {query.trim() ? (
        <div>
          <h3 className="text-xs text-text-t uppercase tracking-wider mb-2">
            Search results
            <span className="ml-2 normal-case tracking-normal text-text-t/70">{searchResults.length}</span>
          </h3>
          {searchResults.length === 0 ? (
            <div className="rounded-md bg-bg/40 border border-border/40 border-dashed p-6 text-center text-sm text-text-t">
              No bookings match.
            </div>
          ) : (
            <div className="space-y-2">{searchResults.map(renderBookingRow)}</div>
          )}
        </div>
      ) : (
        <div>
          <h3 className="text-xs text-text-t uppercase tracking-wider mb-2">Today</h3>
          {todaysBookings.length === 0 ? (
            <div className="rounded-md bg-bg/40 border border-border/40 border-dashed p-6 text-center text-sm text-text-t">
              No bookings scheduled for today.
            </div>
          ) : (
            <div className="space-y-2">{todaysBookings.map(renderBookingRow)}</div>
          )}
        </div>
      )}

      {/* Create new booking */}
      <button
        onClick={handleCreateNew}
        disabled={busy || !submissionId}
        className="w-full py-3.5 text-base text-accent rounded-md border border-accent/40 cursor-pointer press-scale transition-all active:bg-accent/10 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Plus size={18} />
        Create new booking
      </button>
    </div>
  );
}
