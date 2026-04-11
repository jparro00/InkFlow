import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  fullScreenMobile?: boolean;
}

export default function Modal({ title, onClose, children, width = 'lg:max-w-[620px]', fullScreenMobile = true }: ModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center lg:justify-center"
      onClick={onClose}
    >
      {/* Mobile: bottom sheet. Desktop: centered modal */}
      <motion.div
        initial={{ y: '100%', opacity: 1 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 1 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`w-full ${width} bg-elevated shadow-lg overflow-hidden ${
          fullScreenMobile
            ? 'h-[92vh] rounded-t-2xl lg:rounded-2xl lg:h-auto lg:max-h-[85vh]'
            : 'max-h-[85vh] rounded-t-2xl lg:rounded-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-border-s/60" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 lg:px-6 lg:py-4 border-b border-border">
          <h2 className="font-display text-xl text-text-p">{title}</h2>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-surface text-text-t hover:text-text-s transition-colors cursor-pointer"
          >
            <X size={22} />
          </button>
        </div>
        <div className="px-5 py-5 lg:px-6 lg:py-5 overflow-y-auto flex-1"
          style={{ maxHeight: 'calc(100% - 70px)', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        >
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
