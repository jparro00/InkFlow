import { useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Pen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../stores/uiStore';
import BookingDrawer from '../booking/BookingDrawer';
import BookingForm from '../booking/BookingForm';
import QuickBooking from '../QuickBooking';
import SearchOverlay from '../../pages/Search';
import ToastContainer from '../common/Toast';
import { iosSpring } from '../../utils/springs';

type NavDirection = 'push' | 'pop' | 'tab';

const pageVariants = {
  enter: (dir: NavDirection) => {
    if (dir === 'push') return { x: '100%', opacity: 1 };
    if (dir === 'pop') return { x: '-30%', opacity: 0.6 };
    return { x: 0, opacity: 0 }; // tab: fade
  },
  center: { x: 0, opacity: 1 },
  exit: (dir: NavDirection) => {
    if (dir === 'push') return { x: '-30%', opacity: 0.6 };
    if (dir === 'pop') return { x: '100%', opacity: 1 };
    return { x: 0, opacity: 0 }; // tab: fade
  },
};

function getRouteDepth(pathname: string) {
  return pathname.split('/').filter(Boolean).length;
}

export default function AppShell() {
  const {
    sidebarCollapsed,
    selectedBookingId,
    bookingFormOpen,
    quickBookingOpen,
    setQuickBookingOpen,
    searchOpen,
  } = useUIStore();

  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const directionRef = useRef<NavDirection>('tab');

  // Compute direction before render so both enter/exit use the same value
  if (location.pathname !== prevPathRef.current) {
    const prevDepth = getRouteDepth(prevPathRef.current);
    const currDepth = getRouteDepth(location.pathname);
    if (currDepth > prevDepth) directionRef.current = 'push';
    else if (currDepth < prevDepth) directionRef.current = 'pop';
    else directionRef.current = 'tab';
    prevPathRef.current = location.pathname;
  }

  const direction = directionRef.current;

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <Sidebar />

      {/* Main content — full width on mobile, offset on desktop */}
      <main
        className={`flex-1 min-h-full pb-24 lg:pb-0 transition-[margin] duration-300 relative overflow-hidden ${
          sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'
        }`}
      >
        <AnimatePresence custom={direction} initial={false} mode="popLayout">
          <motion.div
            key={location.pathname}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={direction === 'tab' ? iosSpring.tab : iosSpring.gentle}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {selectedBookingId && <BookingDrawer />}
      </AnimatePresence>

      <AnimatePresence>
        {bookingFormOpen && <BookingForm />}
      </AnimatePresence>

      <AnimatePresence>
        {quickBookingOpen && <QuickBooking />}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && <SearchOverlay />}
      </AnimatePresence>

      {/* Quick Booking FAB */}
      <button
        onClick={() => setQuickBookingOpen(true)}
        className="fixed bottom-[100px] right-5 lg:bottom-8 lg:right-8 w-14 h-14 bg-secondary text-bg rounded-2xl shadow-lg shadow-secondary/20 flex items-center justify-center z-30 cursor-pointer press-scale transition-transform active:shadow-glow-strong"
        title="Quick Booking"
      >
        <Pen size={20} />
      </button>

      <MobileTabBar />
      <ToastContainer />
    </div>
  );
}
