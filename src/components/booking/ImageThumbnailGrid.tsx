import { X } from 'lucide-react';
import type { ThumbnailEntry } from '../../hooks/useBookingImages';

interface ImageThumbnailGridProps {
  thumbnails: ThumbnailEntry[];
  editable?: boolean;
  onRemove?: (id: string) => void;
  onView?: (id: string) => void;
}

export default function ImageThumbnailGrid({ thumbnails, editable, onRemove, onView }: ImageThumbnailGridProps) {
  if (!thumbnails.length) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {thumbnails.map((t) => (
        <div key={t.id} className="relative aspect-square">
          <button
            type="button"
            onClick={() => onView?.(t.id)}
            className="w-full h-full cursor-pointer"
          >
            <img
              src={t.url}
              alt={t.filename}
              className="w-full h-full object-cover rounded-lg"
            />
          </button>
          {editable && onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(t.id); }}
              className="absolute top-1 right-1 w-7 h-7 bg-bg/80 rounded-full flex items-center justify-center text-text-s active:text-danger transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
