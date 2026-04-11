import { useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
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
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 400], [1, 0]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDismissing = useRef(false);
  const isDragging = useRef(false);


  // Prevent overscroll bounce at top only
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      if (el.scrollTop <= 0 && e.touches[0].clientY > startY) {
        e.preventDefault();
      }
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);


  const dismiss = () => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    const sheetHeight = sheetRef.current?.offsetHeight ?? 600;
    animate(dragY, sheetHeight, {
      type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
      onComplete: () => {
        onClose();
        isDismissing.current = false;
      },
    });
  };

  const bindDrag = useDrag(
    ({ movement: [, my], velocity: [, vy], direction: [, dy], first, last, cancel }) => {
      if (isDismissing.current) return;

      if (first) {
        const scrollTop = contentRef.current?.scrollTop ?? 0;
        if (scrollTop > 0 && dy > 0) {
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
          animate(dragY, 0, { type: 'spring', stiffness: 400, damping: 30 });
        }
      }
    },
    { axis: 'y', filterTaps: true, threshold: 5, pointer: { touch: true } }
  );

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ opacity: backdropOpacity }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={dismiss}
      />

      {/* Mobile: bottom sheet sized to visual viewport. Desktop: centered modal */}
      <motion.div
        ref={sheetRef}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={{ y: dragY }}
        className={`fixed bottom-0 left-0 right-0 lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:bottom-auto ${width} bg-elevated shadow-lg z-50 flex flex-col overflow-hidden ${
          fullScreenMobile
            ? 'h-[92vh] rounded-t-2xl lg:rounded-2xl lg:h-auto lg:max-h-[85vh]'
            : 'max-h-[85vh] rounded-t-2xl lg:rounded-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...bindDrag()} className="flex flex-col flex-1 overflow-hidden" style={{ touchAction: 'pan-y', overscrollBehavior: 'none' }}>
          {/* Drag handle — mobile */}
          <div className="flex justify-center pt-3 pb-1 lg:hidden">
            <div className="w-10 h-1 rounded-full bg-border-s/60" />
          </div>

          <div className="flex items-center justify-between px-5 py-4 lg:px-6 lg:py-4 border-b border-border shrink-0">
            <h2 className="font-display text-xl text-text-p">{title}</h2>
            <button
              onClick={dismiss}
              className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-surface text-text-t hover:text-text-s transition-colors cursor-pointer"
            >
              <X size={22} />
            </button>
          </div>
          <div ref={contentRef} className="px-5 py-5 lg:px-6 lg:py-5 overflow-y-auto overflow-x-hidden flex-1"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          >
            {children}
          </div>
        </div>
      </motion.div>
    </>
  );
}
