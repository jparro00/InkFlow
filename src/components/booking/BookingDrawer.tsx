import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ArrowLeft, Edit, Trash2, User } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useNavigate } from 'react-router-dom';
import type { BookingStatus } from '../../types';

const statusDot: Record<BookingStatus, string> = {
  Confirmed: 'bg-text-p',
  Tentative: 'bg-[#6B6560]',
  Completed: 'bg-[#3D8C5C]',
  Cancelled: 'bg-[#7A3535]',
  'No-show': 'bg-[#8A6A2A]',
};

const allStatuses: BookingStatus[] = ['Confirmed', 'Tentative', 'Completed', 'Cancelled', 'No-show'];

export default function BookingDrawer() {
  const navigate = useNavigate();
  const { selectedBookingId, setSelectedBookingId, openBookingForm, addToast } = useUIStore();
  const booking = useBookingStore((s) => s.getBooking(selectedBookingId ?? ''));
  const updateBooking = useBookingStore((s) => s.updateBooking);
  const deleteBooking = useBookingStore((s) => s.deleteBooking);
  const client = useClientStore((s) => s.getClient(booking?.client_id ?? ''));

  if (!booking) return null;

  const d = new Date(booking.date);
  const endTime = new Date(d.getTime() + booking.duration * 60 * 60 * 1000);

  const handleDelete = () => {
    const bookingCopy = { ...booking };
    deleteBooking(booking.id);
    setSelectedBookingId(null);
    addToast('Booking deleted', {
      label: 'Undo',
      onClick: () => useBookingStore.getState().addBooking(bookingCopy),
    });
  };

  const handleStatusChange = (status: BookingStatus) => {
    updateBooking(booking.id, { status });
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => setSelectedBookingId(null)}
      />

      {/* Mobile: bottom sheet. Desktop: right drawer */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 lg:top-0 lg:left-auto lg:right-0 lg:bottom-0 max-h-[85vh] lg:max-h-full lg:w-[400px] bg-elevated rounded-t-2xl lg:rounded-none border-t lg:border-t-0 lg:border-l border-border/40 shadow-lg z-50 flex flex-col overflow-hidden"
      >
        {/* Drag handle — mobile */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-border-s/60" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <button
            onClick={() => setSelectedBookingId(null)}
            className="flex items-center gap-2.5 text-text-s active:text-text-p transition-colors cursor-pointer press-scale min-h-[44px]"
          >
            <ArrowLeft size={20} />
            <span className="text-base">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedBookingId(null);
                openBookingForm(booking.id);
              }}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-text-s active:bg-surface transition-colors cursor-pointer press-scale"
            >
              <Edit size={20} />
            </button>
            <button
              onClick={handleDelete}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-text-s active:text-danger transition-colors cursor-pointer press-scale"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Client */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent text-base font-medium shrink-0">
              {client ? client.name.charAt(0) : <User size={20} />}
            </div>
            <div>
              <div className="text-base text-text-p font-medium">{client?.name ?? 'Walk-in'}</div>
              {client?.phone && <div className="text-sm text-text-s mt-0.5">{client.phone}</div>}
            </div>
          </div>

          <div className="h-px bg-border/40" />

          {/* Appointment */}
          <div>
            <div className="text-text-p font-medium">
              {booking.type} &middot; {format(d, 'EEEE, MMM d, yyyy')}
            </div>
            <div className="text-sm text-text-s mt-1">
              {format(d, 'h:mm a')} — {format(endTime, 'h:mm a')} ({booking.duration}h)
            </div>
          </div>

          {/* Tattoo details */}
          {(booking.style || booking.placement || booking.size || booking.color_mode) && (
            <>
              <div className="h-px bg-border/40" />
              <div className="grid grid-cols-2 gap-4">
                {booking.style && (
                  <div>
                    <div className="text-sm text-text-t uppercase tracking-wider mb-1.5 font-medium">Style</div>
                    <div className="text-sm text-text-p">{booking.style}</div>
                  </div>
                )}
                {booking.placement && (
                  <div>
                    <div className="text-sm text-text-t uppercase tracking-wider mb-1.5 font-medium">Placement</div>
                    <div className="text-sm text-text-p">{booking.placement}</div>
                  </div>
                )}
                {booking.size && (
                  <div>
                    <div className="text-sm text-text-t uppercase tracking-wider mb-1.5 font-medium">Size</div>
                    <div className="text-sm text-text-p">{booking.size}</div>
                  </div>
                )}
                {booking.color_mode && (
                  <div>
                    <div className="text-sm text-text-t uppercase tracking-wider mb-1.5 font-medium">Color</div>
                    <div className="text-sm text-text-p">{booking.color_mode}</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Financials */}
          {(booking.deposit != null || booking.estimate != null) && (
            <>
              <div className="h-px bg-border/40" />
              <div>
                {booking.deposit != null && (
                  <div className="text-sm text-text-p">
                    Deposit: ${booking.deposit}{' '}
                    <span
                      className={
                        booking.deposit_paid === 'Paid'
                          ? 'text-success'
                          : booking.deposit_paid === 'Unpaid'
                          ? 'text-danger'
                          : 'text-text-s'
                      }
                    >
                      &middot; {booking.deposit_paid}
                    </span>
                  </div>
                )}
                {booking.estimate != null && (
                  <div className="text-sm text-text-s mt-1">Estimate: ${booking.estimate}</div>
                )}
              </div>
            </>
          )}

          {/* Notes */}
          {booking.notes && (
            <>
              <div className="h-px bg-border/40" />
              <div>
                <div className="text-sm text-text-t uppercase tracking-wider mb-2 font-medium">Notes</div>
                <div className="text-sm text-text-s leading-relaxed">{booking.notes}</div>
              </div>
            </>
          )}

          {/* Status */}
          <div className="h-px bg-border/40" />
          <div>
            <div className="text-sm text-text-t uppercase tracking-wider mb-2.5 font-medium">Status</div>
            <div className="flex items-center gap-2.5 mb-4">
              <span className={`w-3 h-3 rounded-full ${statusDot[booking.status]}`} />
              <span className="text-base text-text-p">{booking.status}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {allStatuses
                .filter((s) => s !== booking.status)
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="px-4 py-3 text-sm rounded-xl border border-border/60 text-text-s active:text-text-p active:bg-surface transition-colors cursor-pointer press-scale min-h-[44px]"
                  >
                    {s}
                  </button>
                ))}
            </div>
          </div>

          {/* View Client */}
          {client && (
            <>
              <div className="h-px bg-border/40" />
              <button
                onClick={() => {
                  setSelectedBookingId(null);
                  navigate(`/clients/${client.id}`);
                }}
                className="w-full text-left text-base text-accent active:text-accent-dim transition-colors cursor-pointer press-scale py-3 min-h-[44px]"
              >
                View Client Profile &rarr;
              </button>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
