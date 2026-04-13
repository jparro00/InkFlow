import { useRef, useEffect, useCallback, useState, createContext, useContext } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Context that gives any child of a Modal access to the animated dismiss function.
 * Call `dismiss()` instead of `onClose()` to get a smooth slide-out animation.
 */
const ModalDismissContext = createContext<() => void>(() => {});

/** Hook for children of Modal to trigger an animated close. */
export function useModalDismiss() {
  return useContext(ModalDismissContext);
}

const R = 28; // must match rounded-t-[28px]

/** SVG trace that follows the rounded top edge of the modal. */
function AccentTrace({ sheetRef, headerRef, trigger }: { sheetRef: React.RefObject<HTMLDivElement | null>; headerRef: React.RefObject<HTMLDivElement | null>; trigger: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);

  useEffect(() => {
    if (sheetRef.current) {
      setW(sheetRef.current.offsetWidth);
    }
    if (headerRef.current) {
      // Measure full header height (drag handle + title + border)
      setH(headerRef.current.offsetHeight);
    }
  }, [sheetRef, headerRef]);

  // Fire laser animation whenever trigger changes
  useEffect(() => {
    const path = pathRef.current;
    const svg = svgRef.current;
    if (!path || !svg || !w || !h || trigger === 0) return;

    const len = path.getTotalLength();
    const segment = len * 0.15;

    // Show SVG, reset to start position (no transition)
    svg.style.opacity = '1';
    path.style.transition = 'none';
    path.style.strokeDasharray = `${segment} ${len}`;
    path.style.strokeDashoffset = `${segment}`;

    // Force reflow so the reset takes effect before animating
    path.getBoundingClientRect();

    // Start animation
    const startTimer = setTimeout(() => {
      path.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
      path.style.strokeDashoffset = `${-len}`;
    }, 50);

    // Hide after animation completes
    const hideTimer = setTimeout(() => {
      svg.style.opacity = '0';
    }, 1600);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(hideTimer);
    };
  }, [w, h, trigger]);

  if (!w || !h) return null;

  // Path: down left side to header bottom → up to corner → across top → down right corner → down right side to header bottom
  const d = `M 0,${h} L 0,${R} A ${R},${R} 0 0,1 ${R},0 L ${w - R},0 A ${R},${R} 0 0,1 ${w},${R} L ${w},${h}`;

  return (
    <svg
      ref={svgRef}
      className="absolute top-0 left-0 z-10 pointer-events-none"
      width={w}
      height={h}
      fill="none"
      style={{ overflow: 'visible', opacity: 0 }}
    >
      <defs>
        <filter id="accent-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        ref={pathRef}
        d={d}
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#accent-glow)"
      />
    </svg>
  );
}

/** Laser trace around the X icon inside the close button */
function XButtonTrace({ trigger }: { trigger: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    const svg = svgRef.current;
    if (!path || !svg || trigger === 0) return;

    const len = path.getTotalLength();
    const segment = len * 0.35;

    svg.style.opacity = '1';
    path.style.transition = 'none';
    path.style.strokeDasharray = `${segment} ${len}`;
    path.style.strokeDashoffset = `${segment}`;
    path.getBoundingClientRect();

    const startTimer = setTimeout(() => {
      path.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
      path.style.strokeDashoffset = `${-len}`;
    }, 30);

    const hideTimer = setTimeout(() => {
      svg.style.opacity = '0';
    }, 1600);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(hideTimer);
    };
  }, [trigger]);

  // Rounded rectangle matching the button's rounded-lg (14px radius in theme)
  // Inset by half stroke width so the stroke outer edge aligns with button edge
  const s = 40;
  const sw = 2.5; // stroke width
  const inset = sw / 2;
  const r = 14 - inset; // shrink radius by inset so outer edge of stroke matches 14px corner
  const d = `M ${inset},${s/2} L ${inset},${r+inset} A ${r},${r} 0 0,1 ${r+inset},${inset} L ${s-r-inset},${inset} A ${r},${r} 0 0,1 ${s-inset},${r+inset} L ${s-inset},${s-r-inset} A ${r},${r} 0 0,1 ${s-r-inset},${s-inset} L ${r+inset},${s-inset} A ${r},${r} 0 0,1 ${inset},${s-r-inset} Z`;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 pointer-events-none"
      width={40}
      height={40}
      fill="none"
      style={{ overflow: 'visible', opacity: 1 }}
    >
      <path
        ref={pathRef}
        d={d}
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ strokeDasharray: 'none', strokeDashoffset: 0 }}
      />
    </svg>
  );
}

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
  /*
   * dragY is the SINGLE source of truth for the sheet's y position.
   * Enter, drag, collapse, and dismiss all animate dragY.
   * We do NOT use framer-motion's declarative animate/initial/exit for y
   * because style={{ y: dragY }} always overrides them.
   */
  const dragY = useMotionValue(instant ? 0 : window.innerHeight);
  const backdropOpacity = useTransform(dragY, [0, 400], [1, 0]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDismissing = useRef(false);
  const isDragging = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const [traceTrigger, setTraceTrigger] = useState(0);
  const [xTraceTrigger, setXTraceTrigger] = useState(0);

  // Keep ref in sync with state
  useEffect(() => { collapsedRef.current = collapsed; }, [collapsed]);

  // Enter animation — slide up from bottom
  useEffect(() => {
    if (!instant) {
      animate(dragY, 0, {
        type: 'spring', damping: 30, stiffness: 300,
        onComplete: () => onReady?.(),
      });
    } else {
      onReady?.();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // When collapsed, listen for taps on non-interactive elements → flash X button
  useEffect(() => {
    if (!collapsed) return;
    const handler = (e: MouseEvent) => {
      // Ignore if tap was on the sheet itself
      if (sheetRef.current?.contains(e.target as Node)) return;
      // Ignore if tap was on an interactive element
      const el = e.target as HTMLElement;
      if (el.closest('button, a, input, textarea, select, [role="button"], [onclick]')) return;
      setXTraceTrigger((n) => n + 1);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [collapsed]);

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
    setTraceTrigger((n) => n + 1);
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

    const sheetHeight = sheetRef.current?.offsetHeight ?? window.innerHeight;

    // Safety net
    dismissTimer.current = setTimeout(() => {
      onClose();
    }, 500);

    animate(dragY, sheetHeight, {
      type: 'spring', stiffness: 200, damping: 30, mass: 1.2,
      onComplete: () => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        onClose();
      },
    });
  }, [onClose, dragY]);

  const handleBackdropClick = useCallback(() => {
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
        const newY = collapsedY + my;
        dragY.set(Math.max(0, newY));
      } else {
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
            expandToFull();
          } else if (my > 60 || (vy > 0.4 && dy > 0)) {
            dismiss();
          } else {
            animate(dragY, collapsedY, { type: 'spring', stiffness: 400, damping: 30 });
          }
        } else {
          if (my > 80 || (vy > 0.4 && dy > 0)) {
            collapseToHeader();
          } else {
            animate(dragY, 0, { type: 'spring', stiffness: 400, damping: 30 });
          }
        }
      }
    },
    { axis: 'y', filterTaps: true, threshold: 5, pointer: { touch: true } }
  );

  return (
    <ModalDismissContext.Provider value={dismiss}>
      {/* Backdrop — pointer-events-none when collapsed so content behind is scrollable */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        className={`fixed inset-0 backdrop-blur-sm z-50 ${collapsed ? 'pointer-events-none' : ''}`}
        style={{ backgroundColor: 'var(--color-overlay)', opacity: backdropOpacity }}
        onClick={handleBackdropClick}
      />

      {/* Sheet — dragY is the sole controller of y position */}
      <motion.div
        ref={sheetRef}
        style={{ y: dragY }}
        className={`fixed top-4 left-0 right-0 bottom-0 lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 ${width} bg-elevated shadow-lg z-50 flex flex-col overflow-hidden ${
          fullScreenMobile
            ? 'rounded-t-[28px] lg:rounded-xl lg:h-auto lg:max-h-[85vh]'
            : 'rounded-t-[28px] lg:rounded-xl max-h-[85vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent trace — laser traces the rounded top outline */}
        <AccentTrace sheetRef={sheetRef} headerRef={headerRef} trigger={traceTrigger} />

        <div {...bindDrag()} className="flex flex-col flex-1 overflow-hidden" style={{ touchAction: 'pan-y', overscrollBehavior: 'none' }}>
          {/* Drag handle + header */}
          <div ref={headerRef} onClick={() => { if (collapsedRef.current) expandToFull(); }}>
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 rounded-full bg-border-s/60" />
            </div>

            {header ? (
              <div className="shrink-0">{header}</div>
            ) : title ? (
              <div className="px-5 py-4 lg:px-6 lg:py-4 border-b border-border shrink-0 flex items-center">
                <h2 className="font-display text-xl text-text-p flex-1">{title}</h2>
                {collapsed && (
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(); }}
                    className="relative w-10 h-10 flex items-center justify-center rounded-lg bg-surface border border-border/40 text-text-s active:text-text-p active:bg-elevated transition-colors cursor-pointer press-scale"
                  >
                    <X size={16} strokeWidth={2.5} />
                    <XButtonTrace trigger={xTraceTrigger} />
                  </button>
                )}
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
    </ModalDismissContext.Provider>
  );
}
