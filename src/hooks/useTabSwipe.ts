import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDrag } from '@use-gesture/react';
import { useMotionValue, animate } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { tabs } from '../components/layout/MobileTabBar';

const TAB_ROUTES = tabs.map((t) => t.to);

/**
 * Hook that provides horizontal swipe-to-change-tabs on mobile.
 * Carousel-style: current page slides off-screen, then route changes.
 *
 * Disabled when:
 * - Any modal is fully open (not collapsed)
 * - Current route is not one of the 4 main tabs
 * - On desktop (viewport >= 1024px)
 * - Drag originates from an element with `data-no-swipe` (e.g. DayView timeline)
 */
export function useTabSwipe() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const animating = useRef(false);

  const modalCollapsed = useUIStore((s) => s.modalCollapsed);
  const bookingFormOpen = useUIStore((s) => s.bookingFormOpen);
  const quickBookingOpen = useUIStore((s) => s.quickBookingOpen);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const createClientFormOpen = useUIStore((s) => s.createClientFormOpen);
  const editingClientId = useUIStore((s) => s.editingClientId);
  const selectedBookingId = useUIStore((s) => s.selectedBookingId);

  const anyModalOpen =
    bookingFormOpen ||
    quickBookingOpen ||
    searchOpen ||
    createClientFormOpen ||
    editingClientId !== null ||
    selectedBookingId !== null;

  const currentIndex = TAB_ROUTES.indexOf(pathname);

  const dragX = useMotionValue(0);

  const bindSwipe = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], first, last, cancel, event }) => {
      // Block during slide-out animation
      if (animating.current) {
        cancel();
        return;
      }

      // Desktop guard
      if (window.innerWidth >= 1024) {
        cancel();
        return;
      }

      // Not on a main tab route
      if (currentIndex === -1) {
        cancel();
        return;
      }

      // Modal fully open blocks swipe
      if (anyModalOpen && !modalCollapsed) {
        cancel();
        return;
      }

      // Check for nested horizontal gesture handlers
      if (first) {
        const target = (event?.target ?? null) as HTMLElement | null;
        if (target?.closest('[data-no-swipe]')) {
          cancel();
          return;
        }
      }

      const canGoLeft = currentIndex > 0;
      const canGoRight = currentIndex < TAB_ROUTES.length - 1;

      // During drag: apply translation with rubber-band at edges
      if (mx > 0 && !canGoLeft) {
        dragX.set(mx * 0.15);
      } else if (mx < 0 && !canGoRight) {
        dragX.set(mx * 0.15);
      } else {
        dragX.set(mx);
      }

      if (last) {
        const swipedRight = dx > 0 && (mx > 80 || vx > 0.3) && canGoLeft;
        const swipedLeft = dx < 0 && (mx < -80 || vx > 0.3) && canGoRight;

        if (swipedLeft || swipedRight) {
          const targetIndex = swipedLeft ? currentIndex + 1 : currentIndex - 1;
          const w = window.innerWidth;
          const slideTarget = swipedLeft ? -w : w;

          // Carousel: slide current page off, then slide new page in from opposite edge
          animating.current = true;
          animate(dragX, slideTarget, {
            type: 'spring',
            stiffness: 300,
            damping: 30,
            mass: 0.8,
            onComplete: () => {
              navigate(TAB_ROUTES[targetIndex]);
              // New page enters from the opposite side
              dragX.set(-slideTarget);
              animate(dragX, 0, {
                type: 'spring',
                stiffness: 300,
                damping: 30,
                mass: 0.8,
                onComplete: () => {
                  animating.current = false;
                },
              });
            },
          });
        } else {
          // Snap back
          animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 30 });
        }
      }
    },
    { axis: 'x', filterTaps: true, threshold: 15, pointer: { touch: true } }
  );

  return { bindSwipe, dragX };
}
