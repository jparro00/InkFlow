import { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import Modal from '../common/Modal';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { getBookingLabel, type Booking } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (bookingId: string) => void | Promise<void>;
  busy?: boolean;
}

/**
 * Lets the artist attach a consent submission to a booking. Phase 1 lists
 * today's bookings only. Phase 4 will add "Create new booking" and a
 * search-by-name affordance for older bookings.
 */
export default function BookingPickerDrawer({ open, onClose, onPick, busy }: Props) {
  const allBookings = useBookingStore((s) => s.bookings);
  const clients = useClientStore((s) => s.clients);

  const today = useMemo(() => new Date(), []);

  const todaysBookings = useMemo<Booking[]>(() => {
    return allBookings
      .filter((b) => isSameDay(new Date(b.date), today))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allBookings, today]);

  if (!open) return null;

  return (
    <Modal title="Attach to booking" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-text-t">
          Pick a booking to attach this consent form to.
        </p>

        <div>
          <h3 className="text-xs text-text-t uppercase tracking-wider mb-2">Today</h3>
          {todaysBookings.length === 0 ? (
            <div className="rounded-md bg-bg/40 border border-border/40 border-dashed p-6 text-center text-sm text-text-t">
              No bookings scheduled for today.
            </div>
          ) : (
            <div className="space-y-2">
              {todaysBookings.map((b) => {
                const clientName = b.client_id
                  ? clients.find((c) => c.id === b.client_id)?.name
                  : undefined;
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
                        {format(new Date(b.date), 'p')} · {b.type}
                      </div>
                    </div>
                    <CalendarIcon size={18} className="text-text-t shrink-0 ml-3" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-2 text-xs text-text-t italic">
          Search older bookings and "Create new booking" coming soon.
        </div>
      </div>
    </Modal>
  );
}
