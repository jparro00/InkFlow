import { Outlet } from 'react-router-dom';
import { Pen } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../stores/uiStore';
import BookingDrawer from '../booking/BookingDrawer';
import BookingForm from '../booking/BookingForm';
import QuickBooking from '../QuickBooking';
import SearchOverlay from '../../pages/Search';
import ToastContainer from '../common/Toast';

export default function AppShell() {
  const {
    sidebarCollapsed,
    selectedBookingId,
    bookingFormOpen,
    quickBookingOpen,
    setQuickBookingOpen,
    searchOpen,
  } = useUIStore();

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <Sidebar />

      {/* Main content — full width on mobile, offset on desktop */}
      <main
        className={`flex-1 min-h-full pb-24 lg:pb-0 transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'
        }`}
      >
        <Outlet />
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
        className="fixed bottom-[100px] right-5 lg:bottom-8 lg:right-8 w-14 h-14 bg-accent text-bg rounded-2xl shadow-lg shadow-accent/20 flex items-center justify-center z-30 cursor-pointer press-scale transition-transform active:shadow-glow-strong"
        title="Quick Booking"
      >
        <Pen size={20} />
      </button>

      <MobileTabBar />
      <ToastContainer />
    </div>
  );
}
