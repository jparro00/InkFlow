import { useState } from 'react';
import { format } from 'date-fns';
import { Edit, Trash2, User } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useImageStore } from '../../stores/imageStore';
import { useBookingImages } from '../../hooks/useBookingImages';
import { deleteImage as deleteImageBlob } from '../../lib/imageDb';
import ImageThumbnailGrid from './ImageThumbnailGrid';
import ImageViewer from './ImageViewer';
import Modal from '../common/Modal';
import { useNavigate } from 'react-router-dom';
import type { BookingStatus } from '../../types';

const allStatuses: BookingStatus[] = ['Confirmed', 'Tentative', 'Completed', 'Cancelled', 'No-show'];

export default function BookingDrawer() {
  const navigate = useNavigate();
  const { selectedBookingId, setSelectedBookingId, openBookingForm, addToast } = useUIStore();
  const booking = useBookingStore((s) => s.bookings.find((b) => b.id === selectedBookingId));
  const updateBooking = useBookingStore((s) => s.updateBooking);
  const deleteBooking = useBookingStore((s) => s.deleteBooking);
  const client = useClientStore((s) => s.clients.find((c) => c.id === (booking?.client_id ?? '')));
  const removeImagesForBooking = useImageStore((s) => s.removeImagesForBooking);
  const allImages = useImageStore((s) => s.images);
  const { thumbnails, getOriginalUrl } = useBookingImages(selectedBookingId ?? undefined);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);

  if (!booking) return null;

  const d = new Date(booking.date);
  const endTime = new Date(d.getTime() + booking.duration * 60 * 60 * 1000);
  const onClose = () => setSelectedBookingId(null);

  const handleDelete = async () => {
    const bookingCopy = { ...booking };
    allImages.filter((img) => img.booking_id === booking.id).forEach((img) => deleteImageBlob(img.id));
    removeImagesForBooking(booking.id);
    try {
      await deleteBooking(booking.id);
    } catch (e) {
      console.error('Failed to delete booking:', e);
    }
    setSelectedBookingId(null);
    addToast('Booking deleted', {
      label: 'Undo',
      onClick: () => { useBookingStore.getState().addBooking(bookingCopy).catch(console.error); },
    });
  };

  const handleStatusChange = async (status: BookingStatus) => {
    try {
      await updateBooking(booking.id, { status });
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  return (
    <>
      <Modal
        title="Booking Details"
        onClose={onClose}
      >
        {/* Actions */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => {
              setSelectedBookingId(null);
              openBookingForm(booking.id);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-border/60 text-sm text-text-s active:text-text-p active:bg-surface transition-colors cursor-pointer press-scale"
          >
            <Edit size={15} />
            <span>Edit</span>
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-border/60 text-sm text-text-s active:text-danger transition-colors cursor-pointer press-scale"
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>

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

        <div className="h-px bg-border/40 my-5" />

        {/* Appointment */}
        <div>
          <div className="text-text-p font-medium">
            {booking.type} &middot; {format(d, 'EEEE, MMM d, yyyy')}
          </div>
          <div className="text-sm text-text-s mt-1">
            {format(d, 'h:mm a')} — {format(endTime, 'h:mm a')} ({booking.duration}h)
          </div>
          {booking.estimate != null && (
            <div className="text-sm text-text-s mt-1">Estimate: ${booking.estimate}</div>
          )}
        </div>

        {/* Notes */}
        {booking.notes && (
          <>
            <div className="h-px bg-border/40 my-5" />
            <div>
              <div className="text-sm text-text-t uppercase tracking-wider mb-2 font-medium">Notes</div>
              <div className="text-sm text-text-s leading-relaxed">{booking.notes}</div>
            </div>
          </>
        )}

        {/* Images */}
        {thumbnails.length > 0 && (
          <>
            <div className="h-px bg-border/40 my-5" />
            <div>
              <div className="text-sm text-text-t uppercase tracking-wider mb-2.5 font-medium">Reference Images</div>
              <ImageThumbnailGrid
                thumbnails={thumbnails}
                onView={(id) => setViewingImageId(id)}
              />
            </div>
          </>
        )}

        {/* Rescheduled flag */}
        <div className="h-px bg-border/40 my-5" />
        <button
          onClick={() => { updateBooking(booking.id, { rescheduled: !booking.rescheduled }).catch(console.error); }}
          className={`flex items-center gap-3 w-full text-left py-3 cursor-pointer press-scale min-h-[44px] transition-colors ${booking.rescheduled ? 'text-danger' : 'text-text-s'}`}
        >
          <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${booking.rescheduled ? 'border-danger bg-danger/20' : 'border-border'}`}>
            {booking.rescheduled && <span className="text-danger text-xs font-bold">✓</span>}
          </span>
          <span className="text-base">Rescheduled</span>
        </button>

        {/* Status */}
        <div className="h-px bg-border/40 my-5" />
        <div>
          <div className="text-sm text-text-t uppercase tracking-wider mb-2.5 font-medium">Status</div>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-3 h-3 rounded-full bg-text-s" />
            <span className="text-base text-text-p">{booking.status}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {allStatuses
              .filter((s) => s !== booking.status)
              .map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className="px-4 py-3 text-sm rounded-md border border-border/60 text-text-s active:text-text-p active:bg-surface transition-colors cursor-pointer press-scale min-h-[44px]"
                >
                  {s}
                </button>
              ))}
          </div>
        </div>

        {/* View Client */}
        {client && (
          <>
            <div className="h-px bg-border/40 my-5" />
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
    </>
  );
}
