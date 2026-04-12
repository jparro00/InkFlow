import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import type { ReactNode } from 'react';

interface ModalProps {
  title?: string;
  header?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  fullScreenMobile?: boolean;
  onReady?: () => void;
  instant?: boolean;
}

export default function Modal({ title, header, onClose, children, width = 'lg:max-w-[620px]', fullScreenMobile = true, onReady, instant }: ModalProps) {
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 400], [1, 0]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDismissing = useRef(false);
  const isDragging = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false); // ref mirror for use in gesture handler

  // Keep ref in sync with state
  useEffect(() => { collapsedRef.current = collapsed; }, [collapsed]);

  // Prevent autoFocus from opening keyboard during modal animation.
  useEffect(() => {
    const blurIfInside = () => {
      const active = document.activeElement as HTMLElement;
      if (active && sheetRef.current?.contains(active)) {
        active.blur();
      }
    };
    blurIfInside();
    const timer = setTimeout(blurIfInside, 50);
    return () => clearTimeout(timer);
  }, []);

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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const getCollapsedY = useCallback(() => {
    const sheetH = sheetRef.current?.offsetHeight ?? 600;
    const headerH = headerRef.current?.offsetHeight ?? 85;
    return sheetH - headerH;
  }, []);

  const collapseToHeader = useCallback(() => {
    const target = getCollapsedY();
    setCollapsed(true);
    animate(dragY, target, { type: 'spring', stiffness: 300, damping: 30 });
  }, [dragY, getCollapsedY]);

  const expandToFull = useCallback(() => {
    setCollapsed(false);
    animate(dragY, 0, { type: 'spring', stiffness: 300, damping: 30 });
  }, [dragY]);

  const dismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    isDragging.current = false;

    const sheetHeight = sheetRef.current?.offsetHeight ?? 600;

    dismissTimer.current = setTimeout(() => {
      onClose();
    }, 500);

    animate(dragY, sheetHeight, {
      type: 'spring', stiffness: 300, damping: 30, mass: 0.8,
      onComplete: () => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        onClose();
      },
    });
  }, [onClose, dragY]);

  const handleBackdropClick = useCallback(() => {
    // Check if we're on mobile (lg breakpoint = 1024px)
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      if (collapsedRef.current) {
        dismiss();
      } else {
        collapseToHeader();
      }
    } else {
      dismiss();
    }
  }, [dismiss, collapseToHeader]);

  const bindDrag = useDrag(
    ({ movement: [, my], velocity: [, vy], direction: [, dy], first, last, cancel }) => {
      if (isDismissing.current) return;

      const isCollapsed = collapsedRef.current;
      const collapsedY = getCollapsedY();

      if (first) {
        if (!isCollapsed) {
          // Full state: only allow drag down when at scroll top
          const scrollTop = contentRef.current?.scrollTop ?? 0;
          if (scrollTop > 0 && dy > 0) {
            cancel();
            return;
          }
        }
        isDragging.current = true;
      }

      if (!isDragging.current) return;

      if (isCollapsed) {
        // Collapsed state: drag relative to collapsed position
        const newY = collapsedY + my;
        // Don't allow dragging above full-open position
        dragY.set(Math.max(0, newY));
      } else {
        // Full state: standard drag behavior
        if (my < 0) {
          dragY.set(0);
          cancel();
          isDragging.current = false;
          return;
        }
        dragY.set(my);
      }

      if (last) {
        isDragging.current = false;

        if (isCollapsed) {
          if (my < -40 || (vy > 0.3 && dy < 0)) {
            // Swiped up from collapsed → expand to full
            expandToFull();
          } else if (my > 60 || (vy > 0.4 && dy > 0)) {
            // Swiped down from collapsed → dismiss
            dismiss();
          } else {
            // Return to collapsed position
            animate(dragY, collapsedY, { type: 'spring', stiffness: 400, damping: 30 });
          }
        } else {
          if (my > 80 || (vy > 0.4 && dy > 0)) {
            // Swiped down from full → collapse to header
            collapseToHeader();
          } else {
            // Snap back to full
            animate(dragY, 0, { type: 'spring', stiffness: 400, damping: 30 });
          }
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
        transition={{ duration: 0.2 }}
        className="fixed inset-0 backdrop-blur-sm z-50"
        style={{ backgroundColor: 'var(--color-overlay)', opacity: backdropOpacity }}
        onClick={handleBackdropClick}
      />

      {/* Mobile: bottom sheet. Desktop: centered modal */}
      <motion.div
        ref={sheetRef}
        initial={instant ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onAnimationComplete={() => onReady?.()}
        style={{ y: dragY }}
        className={`fixed top-4 left-0 right-0 bottom-0 lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 ${width} bg-elevated shadow-lg z-50 flex flex-col overflow-hidden ${
          fullScreenMobile
            ? 'rounded-t-[28px] lg:rounded-xl lg:h-auto lg:max-h-[85vh]'
            : 'rounded-t-[28px] lg:rounded-xl max-h-[85vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...bindDrag()} className="flex flex-col flex-1 overflow-hidden" style={{ touchAction: 'pan-y', overscrollBehavior: 'none' }}>
          {/* Drag handle + header — measured together for collapse target */}
          <div ref={headerRef} onClick={() => { if (collapsedRef.current) expandToFull(); }}>
            {/* Drag handle — mobile */}
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 rounded-full bg-border-s/60" />
            </div>

            {/* Header — custom or default title */}
            {header ? (
              <div className="shrink-0">{header}</div>
            ) : title ? (
              <div className="px-5 py-4 lg:px-6 lg:py-4 border-b border-border shrink-0">
                <h2 className="font-display text-xl text-text-p">{title}</h2>
              </div>
            ) : null}
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
