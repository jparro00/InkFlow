import { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { format } from 'date-fns';
import { ArrowLeft, Edit, Trash2, User } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useBookingStore } from '../../stores/bookingStore';
import { useClientStore } from '../../stores/clientStore';
import { useImageStore } from '../../stores/imageStore';
import { useBookingImages } from '../../hooks/useBookingImages';
import { deleteImage as deleteImageBlob } from '../../lib/imageDb';
import ImageThumbnailGrid from './ImageThumbnailGrid';
import ImageViewer from './ImageViewer';
import { useNavigate } from 'react-router-dom';
import type { BookingStatus } from '../../types';
import { iosSpring } from '../../utils/springs';

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

  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 400], [1, 0]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDismissing = useRef(false);
  const isDragging = useRef(false);

  const dismiss = () => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    const sheetHeight = sheetRef.current?.offsetHeight ?? 600;
    animate(dragY, sheetHeight, {
      ...iosSpring.dismiss,
      onComplete: () => {
        setSelectedBookingId(null);
        isDismissing.current = false;
      },
    });
  };

  // Drag on the entire sheet — only activates when scrolled to top
  const bindDrag = useDrag(
    ({ movement: [, my], velocity: [, vy], direction: [, dy], first, last, cancel }) => {
      if (isDismissing.current) return;

      // On first move, check if content is scrolled down
      if (first) {
        const scrollTop = contentRef.current?.scrollTop ?? 0;
        if (scrollTop > 0 && dy > 0) {
          // Content is scrolled — let native scroll handle it
          cancel();
          return;
        }
        isDragging.current = true;
      }

      if (!isDragging.current) return;

      if (my < 0) {
        dragY.set(0);
        cancel();
        isDragging.current = false;
        return;
      }
      dragY.set(my);

      if (last) {
        isDragging.current = false;
        if (my > 80 || (vy > 0.4 && dy > 0)) {
          dismiss();
        } else {
          animate(dragY, 0, iosSpring.cancel);
        }
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      threshold: 5,
      pointer: { touch: true },
    }
  );

  if (!booking) return null;

  const d = new Date(booking.date);
  const endTime = new Date(d.getTime() + booking.duration * 60 * 60 * 1000);

  const handleDelete = () => {
    const bookingCopy = { ...booking };
    // Clean up images from IndexedDB
    allImages.filter((img) => img.booking_id === booking.id).forEach((img) => deleteImageBlob(img.id));
    removeImagesForBooking(booking.id);
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
        style={{ opacity: backdropOpacity }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={dismiss}
      />

      {/* Mobile: bottom sheet. Desktop: right drawer */}
      <motion.div
        ref={sheetRef}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={iosSpring.present}
        style={{ y: dragY }}
        className="fixed bottom-0 left-0 right-0 lg:top-0 lg:left-auto lg:right-0 lg:bottom-0 max-h-[85vh] lg:max-h-full lg:w-[400px] bg-elevated rounded-t-2xl lg:rounded-none border-t lg:border-t-0 lg:border-l border-border/40 shadow-lg z-50 flex flex-col overflow-hidden"
      >
        {/* Entire sheet is drag-bound — gesture only activates when at scroll top */}
        <div {...bindDrag()} className="flex flex-col flex-1 overflow-hidden" style={{ touchAction: 'pan-y' }}>
          {/* Drag handle — mobile */}
          <div className="flex justify-center pt-3 pb-1 lg:hidden">
            <div className="w-10 h-1 rounded-full bg-border-s/60" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
            <button
              onClick={dismiss}
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
          <div ref={contentRef} className="flex-1 overflow-y-auto p-5 space-y-6" style={{ overscrollBehavior: 'contain' }}>
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
              {booking.estimate != null && (
                <div className="text-sm text-text-s mt-1">Estimate: ${booking.estimate}</div>
              )}
            </div>

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

            {/* Images */}
            {thumbnails.length > 0 && (
              <>
                <div className="h-px bg-border/40" />
                <div>
                  <div className="text-sm text-text-t uppercase tracking-wider mb-2.5 font-medium">Reference Images</div>
                  <ImageThumbnailGrid
                    thumbnails={thumbnails}
                    onView={(id) => setViewingImageId(id)}
                  />
                </div>
              </>
            )}

            {/* Status */}
            <div className="h-px bg-border/40" />
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
        </div>
      </motion.div>

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
