import { useRef, useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { iosSpring } from '../../utils/springs';

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

  // Track keyboard via visualViewport
  const [vpHeight, setVpHeight] = useState(() =>
    typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 800
  );
  const fullHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const keyboardOpen = fullHeight - vpHeight > 100;

  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const handler = () => setVpHeight(vp.height);
    vp.addEventListener('resize', handler);
    return () => vp.removeEventListener('resize', handler);
  }, []);

  // When an input is focused, scroll it into view within the modal content
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onFocusIn = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement;
        if (active && el.contains(active)) {
          active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 300); // Wait for keyboard to finish opening
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, []);

  const dismiss = () => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    const sheetHeight = sheetRef.current?.offsetHeight ?? 600;
    animate(dragY, sheetHeight, {
      ...iosSpring.dismiss,
      onComplete: () => {
        onClose();
        isDismissing.current = false;
      },
    });
  };

  const bindDrag = useDrag(
    ({ movement: [, my], velocity: [, vy], direction: [, dy], first, last, cancel }) => {
      if (isDismissing.current) return;

      // Don't allow drag-to-dismiss when keyboard is open
      if (keyboardOpen) {
        cancel();
        return;
      }

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
          animate(dragY, 0, iosSpring.cancel);
        }
      }
    },
    { axis: 'y', filterTaps: true, threshold: 5, pointer: { touch: true } }
  );

  // Mobile sheet height: use viewport height to stay above keyboard
  const sheetHeight = fullScreenMobile ? vpHeight : Math.min(vpHeight * 0.85, vpHeight);

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
        transition={iosSpring.present}
        style={{
          y: dragY,
          bottom: 0,
          height: `${sheetHeight}px`,
          transition: 'height 0.15s ease-out',
        }}
        className={`fixed left-0 right-0 lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:bottom-auto ${width} bg-elevated shadow-lg z-50 flex flex-col overflow-hidden rounded-t-2xl lg:rounded-2xl lg:h-auto lg:max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...bindDrag()} className="flex flex-col flex-1 overflow-hidden" style={{ touchAction: 'pan-y' }}>
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
