import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { Edit, Trash2, User, Camera, FileText, CalendarPlus, Calendar } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useImageStore } from '../../stores/imageStore';
import { useBookingImages } from '../../hooks/useBookingImages';
import { useDocumentStore } from '../../stores/documentStore';
import { deleteImage as deleteImageBlob } from '../../lib/imageDb';
import ImageThumbnailGrid from './ImageThumbnailGrid';
import ImageViewer from './ImageViewer';
import Modal from '../common/Modal';
import { useNavigate } from 'react-router-dom';
import { exportBookingToCalendar } from '../../utils/calendar';

export default function BookingDrawer() {
  const navigate = useNavigate();
  const { selectedBookingId, setSelectedBookingId, openBookingForm, addToast } = useUIStore();
  const booking = useBookingStore((s) => s.bookings.find((b) => b.id === selectedBookingId));
  const updateBooking = useBookingStore((s) => s.updateBooking);
  const deleteBooking = useBookingStore((s) => s.deleteBooking);
  const client = useClientStore((s) => s.clients.find((c) => c.id === (booking?.client_id ?? '')));
  const linkedProfiles = useClientStore((s) => s.linkedProfiles);
  const removeImagesForBooking = useImageStore((s) => s.removeImagesForBooking);
  const allImages = useImageStore((s) => s.images);
  const { thumbnails, getOriginalUrl, addImages } = useBookingImages(selectedBookingId ?? undefined);
  const uploadDocument = useDocumentStore((s) => s.uploadDocument);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <Modal
        title="Booking Details"
        onClose={onClose}
        canCollapse={false}
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

        {/* Client (or Title for Personal bookings) */}
        <div className="flex items-center gap-4">
          {booking.type === 'Personal' ? (
            <>
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent shrink-0">
                <Calendar size={20} />
              </div>
              <div>
                <div className="text-base text-text-p font-medium">{booking.title || 'Personal'}</div>
                <div className="text-sm text-text-s mt-0.5">Personal appointment</div>
              </div>
            </>
          ) : (
            <>
              {(() => {
                if (!client) return (
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent text-base font-medium shrink-0">
                    <User size={20} />
                  </div>
                );
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
              <div>
                <div className="text-base text-text-p font-medium">{client?.name ?? 'Walk-in'}</div>
                {client?.phone && <div className="text-sm text-text-s mt-0.5">{client.phone}</div>}
              </div>
            </>
          )}
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

        {/* Upload buttons */}
        <div className="h-px bg-border/40 my-5" />
        <div className="flex gap-3">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-input border border-border/60 rounded-md text-text-s active:text-text-p active:bg-elevated transition-colors cursor-pointer press-scale min-h-[48px]"
          >
            <Camera size={18} />
            <span className="text-sm">Add Photo</span>
          </button>
          {/* label-wrapped input (not button+ref.click) so the native picker
              opens from a native user gesture on iOS PWA. Accepts images too
              — most booking documents are photos of IDs / consent forms —
              and forces type='other' so uploads land in Docs, not Photos. */}
          <label
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-input border border-border/60 rounded-md text-text-s active:text-text-p active:bg-elevated transition-colors cursor-pointer press-scale min-h-[48px]"
          >
            <FileText size={18} />
            <span className="text-sm">Add Document</span>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              multiple
              onChange={async (e) => {
                if (e.target.files?.length && booking.client_id) {
                  for (const file of Array.from(e.target.files)) {
                    try {
                      await uploadDocument(file, booking.client_id, booking.id, 'other');
                      addToast('Document uploaded');
                    } catch (err) {
                      console.error('Failed to upload document:', err);
                      addToast('Upload failed');
                    }
                  }
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
          </label>
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) {
              addImages(e.target.files);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

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

        {/* Export to Calendar */}
        <div className="h-px bg-border/40 my-5" />
        <button
          onClick={() => {
            const label = booking.type === 'Personal'
              ? (booking.title || 'Personal')
              : (client?.name ?? 'Walk-in');
            exportBookingToCalendar(booking, label);
          }}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 bg-input border border-border/60 rounded-md text-text-s active:text-accent active:bg-elevated transition-colors cursor-pointer press-scale min-h-[52px]"
        >
          <CalendarPlus size={20} />
          <span className="text-sm">Add to Calendar</span>
        </button>
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
