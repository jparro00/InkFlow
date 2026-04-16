import { useRef, useEffect, useCallback, useState, createContext, useContext } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useUIStore } from '../../stores/uiStore';

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

/**
 * Laser trace around the X close button — Material Design indeterminate-style.
 *
 * Two independently eased edges create the natural grow-travel-shrink effect:
 * - Head (leading edge): ease-out — races ahead quickly, decelerates at the end
 * - Tail (trailing edge): ease-in — starts slow, accelerates to catch up
 *
 * This produces a segment that organically grows as the head outpaces the tail,
 * travels around the button, then tapers to nothing as the tail catches up.
 */
function XButtonTrace({ trigger, buttonRef }: { trigger: number; buttonRef: React.RefObject<HTMLButtonElement | null> }) {
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [shape, setShape] = useState<{ w: number; h: number; r: number } | null>(null);

  // Read the button's actual size and border-radius from the DOM
  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const styles = getComputedStyle(btn);
    const w = btn.offsetWidth;
    const h = btn.offsetHeight;
    const r = parseFloat(styles.borderRadius) || 0;
    setShape({ w, h, r });
  }, [buttonRef, trigger]);

  useEffect(() => {
    const path = pathRef.current;
    const svg = svgRef.current;
    if (!path || !svg || !shape || trigger === 0) return;

    const len = path.getTotalLength();
    const duration = 1000;

    svg.style.transition = 'none';
    svg.style.opacity = '1';
    path.style.transition = 'none';

    let raf: number;
    let cancelled = false;
    const startTime = performance.now();

    // Head: ease-in-out — starts slow, bursts through the middle, eases out
    const easeInOut = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // Tail: quartic ease-in with gentle deceleration at the end
    // t⁴ for the first 70%, then eases out for the final 30%
    const tailEase = (t: number) => {
      if (t < 0.7) return Math.pow(t / 0.7, 4) * 0.7;
      const t2 = (t - 0.7) / 0.3;
      return 0.7 + 0.3 * (1 - (1 - t2) * (1 - t2));
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min((now - startTime) / duration, 1);

      // Head bursts through middle (ease-in-out), tail chases (quartic ease-in)
      const headPos = easeInOut(t) * len;
      const tailPos = tailEase(t) * len;
      const segLen = Math.max(headPos - tailPos, 0.5);

      // Fade out when segment becomes negligible
      if (t >= 1 || segLen < 0.5) {
        svg.style.opacity = '0';
        return;
      }

      path.style.strokeDasharray = `${segLen} ${len}`;
      path.style.strokeDashoffset = `${-tailPos}`;

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [shape, trigger]);

  if (!shape) return null;

  const { w, h, r } = shape;
  const sw = 1.5;
  const i = sw / 2; // inset so stroke outer edge aligns with button outer edge
  const ri = r - i; // inset radius
  // Open path — no Z close. Ends 1px before start so the segment runs off the end
  // and vanishes instead of wrapping back to the beginning.
  const d = `M ${i},${h/2} L ${i},${ri+i} A ${ri},${ri} 0 0,1 ${ri+i},${i} L ${w-ri-i},${i} A ${ri},${ri} 0 0,1 ${w-i},${ri+i} L ${w-i},${h-ri-i} A ${ri},${ri} 0 0,1 ${w-ri-i},${h-i} L ${ri+i},${h-i} A ${ri},${ri} 0 0,1 ${i},${h-ri-i} L ${i},${h/2 + 1}`;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 pointer-events-none"
      width={w}
      height={h}
      fill="none"
      style={{ overflow: 'visible', opacity: 0 }}
    >
      <defs>
        <filter id="x-glow" x="-50%" y="-50%" width="200%" height="200%">
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
        strokeWidth={sw}
        strokeLinecap="round"
        filter="url(#x-glow)"
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
  canCollapse?: boolean;
}

export default function Modal({ title, header, onClose, children, width = 'lg:max-w-[620px]', fullScreenMobile = true, onReady, instant, canCollapse = true }: ModalProps) {
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
  const xButtonRef = useRef<HTMLButtonElement>(null);
  const isDismissing = useRef(false);
  const isDragging = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const [traceTrigger, setTraceTrigger] = useState(0);
  const [xTraceTrigger, setXTraceTrigger] = useState(0);

  const setModalCollapsed = useUIStore((s) => s.setModalCollapsed);

  // Keep ref in sync with state, sync to global store
  useEffect(() => {
    collapsedRef.current = collapsed;
    setModalCollapsed(collapsed);
  }, [collapsed, setModalCollapsed]);

  // Clear collapsed on unmount
  useEffect(() => {
    return () => setModalCollapsed(false);
  }, [setModalCollapsed]);

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

  // Keyboard handling fallback for iOS < 17.2 (older devices without
  // `interactive-widget=resizes-content` support). We only resize the sheet's
  // height based on the visual viewport — we deliberately do NOT track
  // `vv.offsetTop`, because iOS emits transient non-zero offsetTop values
  // during the keyboard animation which cause the top to jump. The body
  // scroll lock (below) prevents the layout viewport from actually scrolling,
  // so `top: 16` stays visually at 16px without any JS help.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const mq = window.matchMedia('(max-width: 1023px)');

    const update = () => {
      const el = sheetRef.current;
      if (!el) return;
      if (!mq.matches) {
        el.style.bottom = '';
        el.style.height = '';
        return;
      }
      el.style.bottom = 'auto';
      el.style.height = `${vv.height - 32}px`;
    };

    vv.addEventListener('resize', update);
    mq.addEventListener('change', update);
    window.addEventListener('orientationchange', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Lock background scrolling so the page behind the modal doesn't move.
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;

    const prev = {
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      body.style.overflow = prev.bodyOverflow;
      html.style.overflow = prev.htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const getCollapsedY = useCallback(() => {
    const sheetH = sheetRef.current?.offsetHeight ?? 600;
    const headerH = headerRef.current?.offsetHeight ?? 85;
    return sheetH - headerH;
  }, []);

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

  const collapseToHeader = useCallback(() => {
    if (!canCollapse) {
      dismiss();
      return;
    }
    const target = getCollapsedY();
    setCollapsed(true);
    setTraceTrigger((n) => n + 1);
    animate(dragY, target, { type: 'spring', stiffness: 300, damping: 30 });
  }, [dragY, getCollapsedY, canCollapse, dismiss]);

  const expandToFull = useCallback(() => {
    setCollapsed(false);
    setXTraceTrigger(0); // Reset so X button doesn't re-fire on next collapse
    animate(dragY, 0, { type: 'spring', stiffness: 300, damping: 30 });
  }, [dragY]);

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

      {/* Sheet — dragY is the sole controller of y position.
          Keyboard resize is handled by `interactive-widget=resizes-content`
          in the viewport meta, which shrinks the layout viewport so the
          sheet's `bottom: 0` naturally sits above the keyboard. */}
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
              <div className="px-5 py-4 lg:px-6 lg:py-4 border-b border-border shrink-0 flex items-center relative">
                <h2 className="font-display text-xl text-text-p flex-1">{title}</h2>
                {collapsed && (
                  <button
                    ref={xButtonRef}
                    onClick={(e) => { e.stopPropagation(); dismiss(); }}
                    className="absolute top-5 right-5 lg:top-4 lg:right-6 w-10 h-10 flex items-center justify-center rounded-lg bg-surface border border-border/40 text-text-s active:text-text-p active:bg-elevated transition-colors cursor-pointer press-scale"
                  >
                    <X size={16} strokeWidth={2.5} />
                    <XButtonTrace trigger={xTraceTrigger} buttonRef={xButtonRef} />
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
