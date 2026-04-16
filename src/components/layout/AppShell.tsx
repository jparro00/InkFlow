import { Outlet } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../stores/uiStore';
import BookingDrawer from '../booking/BookingDrawer';
import BookingForm from '../booking/BookingForm';
import CreateClientForm from '../client/CreateClientForm';
import ClientForm from '../client/ClientForm';
import QuickBooking from '../QuickBooking';
import SearchOverlay from '../../pages/Search';
import ConversationDrawer from '../messaging/ConversationDrawer';
import ToastContainer from '../common/Toast';
import { useClientStore } from '../../stores/clientStore';

export default function AppShell() {
  const {
    sidebarCollapsed,
    selectedBookingId,
    bookingFormOpen,
    quickBookingOpen,
    setQuickBookingOpen,
    searchOpen,
    createClientFormOpen,
    setCreateClientFormOpen,
    editingClientId,
    setEditingClientId,
    selectedConversationId,
  } = useUIStore();
  const editingClient = useClientStore((s) => editingClientId ? s.clients.find((c) => c.id === editingClientId) : undefined);

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <Sidebar />

      {/* Main content — full width on mobile, offset on desktop */}
      <div
        className={`flex-1 flex flex-col pb-[100px] lg:pb-0 transition-all duration-300 overflow-hidden ${
          sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]'
        }`}
      >
        <AppHeader />
        <main
          className="flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <Outlet />
        </main>
      </div>

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

      <AnimatePresence>
        {selectedConversationId && <ConversationDrawer />}
      </AnimatePresence>

      <AnimatePresence>
        {createClientFormOpen && <CreateClientForm onClose={() => setCreateClientFormOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {editingClient && <ClientForm client={editingClient} onClose={() => setEditingClientId(null)} />}
      </AnimatePresence>

      {/* Quick Booking FAB */}
      <button
        onClick={() => setQuickBookingOpen(true)}
        className="fixed bottom-[116px] right-5 lg:bottom-8 lg:right-8 w-[84px] h-[84px] bg-accent text-bg rounded-2xl shadow-lg shadow-glow flex items-center justify-center z-30 cursor-pointer press-scale transition-transform active:shadow-glow-strong"
        title="Quick Booking"
      >
        <Bot size={40} />
      </button>

      <MobileTabBar />
      <ToastContainer />
    </div>
  );
}
