import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ThumbnailEntry } from '../../hooks/useBookingImages';

interface ImageViewerProps {
  thumbnails: ThumbnailEntry[];
  initialId: string;
  getOriginalUrl: (id: string) => Promise<string | null>;
  onClose: () => void;
}

export default function ImageViewer({ thumbnails, initialId, getOriginalUrl, onClose }: ImageViewerProps) {
  const initialIndex = thumbnails.findIndex((t) => t.id === initialId);
  const [index, setIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const current = thumbnails[index];

  // Load original image
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setLoading(true);
    setOriginalUrl(null);

    getOriginalUrl(current.id).then((url) => {
      if (!cancelled) {
        setOriginalUrl(url);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, getOriginalUrl]);

  const prev = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setIndex((i) => (i > 0 ? i - 1 : thumbnails.length - 1));
  }, [originalUrl, thumbnails.length]);

  const next = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setIndex((i) => (i < thumbnails.length - 1 ? i + 1 : 0));
  }, [originalUrl, thumbnails.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  if (!current) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-overlay-heavy)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-12 h-12 flex items-center justify-center rounded-full bg-text-p/10 text-text-p active:bg-text-p/20 transition-colors cursor-pointer z-10"
      >
        <X size={22} />
      </button>

      {/* Counter */}
      {thumbnails.length > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 text-sm text-text-s z-10">
          {index + 1} / {thumbnails.length}
        </div>
      )}

      {/* Image */}
      <div className="w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <img
          src={originalUrl ?? current.url}
          alt={current.filename}
          className={`max-w-full max-h-full object-contain rounded-lg transition-opacity ${loading ? 'opacity-60 blur-sm' : ''}`}
        />
      </div>

      {/* Navigation arrows */}
      {thumbnails.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-text-p/10 text-text-p active:bg-text-p/20 transition-colors cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-text-p/10 text-text-p active:bg-text-p/20 transition-colors cursor-pointer"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
    </motion.div>,
    document.body
  );
}
