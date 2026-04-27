import { Outlet } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useEffect, lazy, Suspense } from 'react';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../stores/uiStore';
import { useClientStore } from '../../stores/clientStore';
import { useAgentStore } from '../../stores/agentStore';

// Lazy-load every modal/drawer + the agent UI. Each is hidden by default,
// so there's no reason to parse their code (and the framer-motion they
// pull in transitively) on the first render of AppShell. They're imported
// in parallel the moment the user opens whichever surface they need.
const BookingDrawer = lazy(() => import('../booking/BookingDrawer'));
const BookingForm = lazy(() => import('../booking/BookingForm'));
const CreateClientForm = lazy(() => import('../client/CreateClientForm'));
const ClientForm = lazy(() => import('../client/ClientForm'));
const AgentPanel = lazy(() => import('../agent/AgentPanel'));
const AgentFeedbackPrompt = lazy(() => import('../agent/AgentFeedbackPrompt'));
const SearchOverlay = lazy(() => import('../../pages/Search'));
const ConversationDrawer = lazy(() => import('../messaging/ConversationDrawer'));
const ConsentFormDrawer = lazy(() => import('../forms/ConsentFormDrawer'));
const ToastContainer = lazy(() => import('../common/Toast'));

export default function AppShell() {
  const {
    sidebarCollapsed,
    selectedBookingId,
    bookingFormOpen,
    searchOpen,
    createClientFormOpen,
    setCreateClientFormOpen,
    editingClientId,
    setEditingClientId,
    selectedConversationId,
    selectedConsentSubmissionId,
    confirmDialogOpen,
  } = useUIStore();
  const editingClient = useClientStore((s) => editingClientId ? s.clients.find((c) => c.id === editingClientId) : undefined);
  const agentPanelOpen = useAgentStore((s) => s.panelOpen);
  const openAgentPanel = useAgentStore((s) => s.openPanel);
  const isProcessing = useAgentStore((s) => s.isProcessing);
  const traceActive = useAgentStore((s) => s.traceActive);
  const showFeedbackPrompt = useAgentStore((s) => s.showFeedbackPrompt);

  // When an exchange is active and everything settles (panel closed, no
  // modals/drawers open, agent not processing), trigger the feedback prompt.
  // Debounce briefly to absorb transient states (e.g. agent closing panel
  // while a form is opening in the same tick).
  useEffect(() => {
    if (!traceActive) return;
    if (isProcessing || agentPanelOpen) return;
    if (
      bookingFormOpen ||
      selectedBookingId ||
      createClientFormOpen ||
      editingClientId ||
      selectedConversationId ||
      searchOpen
    ) return;

    const timer = setTimeout(() => {
      showFeedbackPrompt();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    traceActive,
    isProcessing,
    agentPanelOpen,
    bookingFormOpen,
    selectedBookingId,
    createClientFormOpen,
    editingClientId,
    selectedConversationId,
    searchOpen,
    showFeedbackPrompt,
  ]);

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

      {/* Modals & drawers — null fallback because they're invisible until
          their open flag is set; no need to flash a spinner. */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {selectedBookingId && <BookingDrawer />}
        </AnimatePresence>

        <AnimatePresence>
          {bookingFormOpen && <BookingForm />}
        </AnimatePresence>

        <AnimatePresence>
          {agentPanelOpen && <AgentPanel />}
        </AnimatePresence>

        <AnimatePresence>
          {searchOpen && <SearchOverlay />}
        </AnimatePresence>

        <AnimatePresence>
          {selectedConversationId && <ConversationDrawer />}
        </AnimatePresence>

        <AnimatePresence>
          {selectedConsentSubmissionId && <ConsentFormDrawer />}
        </AnimatePresence>

        <AnimatePresence>
          {createClientFormOpen && (
            <CreateClientForm
              onClose={() => {
                setCreateClientFormOpen(false);
                useUIStore.getState().setPrefillClientData(null);
              }}
              initialData={useUIStore.getState().prefillClientData
                ? { name: useUIStore.getState().prefillClientData?.name }
                : undefined
              }
              onCreated={async (newClientId) => {
                // Compound flow: if there's a pending agent booking/create
                // intent, resume it with the new client_id so the user
                // flows straight into the booking form without typing
                // again. Dynamic import keeps the orchestrator (1k+ lines
                // + 5 agent files) off the AppShell boot bundle.
                const agent = useAgentStore.getState();
                const pending = agent.pendingIntent;
                if (
                  pending &&
                  pending.agent === 'booking' &&
                  pending.action === 'create'
                ) {
                  agent.logTrace('compound_continue', { newClientId });
                  const { handleSelection } = await import('../../agents/orchestrator');
                  handleSelection('client', newClientId);
                }
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editingClient && <ClientForm client={editingClient} onClose={() => setEditingClientId(null)} />}
        </AnimatePresence>

        <AgentFeedbackPrompt />
        <ToastContainer />
      </Suspense>

      {/* Agent FAB — hidden during page-level confirm dialogs so the button
          doesn't sit visually on top of a "Yes, delete" action. */}
      {!confirmDialogOpen && (
        <button
          onClick={openAgentPanel}
          className="fixed bottom-[116px] right-5 lg:bottom-8 lg:right-8 w-[84px] h-[84px] bg-accent text-bg rounded-2xl shadow-lg shadow-glow flex items-center justify-center z-30 cursor-pointer press-scale transition-transform active:shadow-glow-strong"
          title="Inklet - AI Assistant"
        >
          <Bot size={40} />
        </button>
      )}

      <MobileTabBar />
    </div>
  );
}
