import { Outlet, useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useEffect, lazy, Suspense } from 'react';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../stores/uiStore';
import { useClientStore } from '../../stores/clientStore';
import { useAgentStore } from '../../stores/agentStore';
import { useAppBadge } from '../../hooks/useAppBadge';
import { refreshPushSubscription } from '../../lib/pushSubscription';

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
const BookingPickerDrawer = lazy(() => import('../forms/BookingPickerDrawer'));
const FinalizeFormDrawer = lazy(() => import('../forms/FinalizeFormDrawer'));
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
    attachToBookingSubmissionId,
    finalizeSubmissionId,
    confirmDialogOpen,
  } = useUIStore();
  const editingClient = useClientStore((s) => editingClientId ? s.clients.find((c) => c.id === editingClientId) : undefined);
  const agentPanelOpen = useAgentStore((s) => s.panelOpen);
  const openAgentPanel = useAgentStore((s) => s.openPanel);
  const isProcessing = useAgentStore((s) => s.isProcessing);
  const traceActive = useAgentStore((s) => s.traceActive);
  const showFeedbackPrompt = useAgentStore((s) => s.showFeedbackPrompt);

  // Mirror pending consent-submission count onto the OS app icon so the
  // artist sees a badge on the home-screen PWA / dock. Works silently
  // until iOS notification permission is granted; the in-app sidebar
  // badge already covers the case where it isn't.
  useAppBadge();

  // Refresh the Web Push subscription on every authenticated boot. If a
  // subscription already exists in the browser, we re-POST it to keep
  // last_seen_at fresh and to recover from any server-side row deletion
  // (e.g. if the row got GC'd as part of dead-subscription cleanup but
  // the device still has a valid subscription locally). Fire-and-forget
  // — silent on failure.
  useEffect(() => {
    void refreshPushSubscription();
  }, []);

  // Pick up notification taps that should deep-link to a specific consent
  // submission. Three triggers, all funnel through the same cache-backed
  // consumer so we never act on the same tap twice:
  //   1. SW postMessage — fast path, works in active foreground.
  //   2. visibilitychange to visible — fallback for iOS Safari, which can
  //      silently drop postMessage during a backgrounded → foregrounded
  //      transition. The SW writes the same submissionId to a stable Cache
  //      API entry before postMessage'ing, and we read it here.
  //   3. Mount — covers any case where the page reloaded between the SW
  //      writing the cache entry and the page hooking up its listeners
  //      (also redundant with FormsPage's ?submission= URL handling).
  const navigate = useNavigate();
  const setSelectedConsentSubmissionId = useUIStore(
    (s) => s.setSelectedConsentSubmissionId,
  );
  useEffect(() => {
    let cancelled = false;

    const consumePending = async () => {
      try {
        const cache = await caches.open('inkbloop-pending-action');
        const res = await cache.match('/__pending-submission');
        if (!res) return;
        // Delete first so a concurrent visibilitychange + message pair
        // doesn't fire the navigation twice.
        await cache.delete('/__pending-submission');
        const data = (await res.json()) as { submissionId?: string; ts?: number };
        if (!data.submissionId) return;
        // Drop stale entries — if the user dismissed without tapping for
        // a minute, we shouldn't ambush them with an old form on next focus.
        if (data.ts && Date.now() - data.ts > 60_000) return;
        if (cancelled) return;
        navigate('/forms');
        setSelectedConsentSubmissionId(data.submissionId);
      } catch {
        // Cache API may be unavailable (e.g. private mode). Silent — the
        // SW message path still has a chance.
      }
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === 'openConsentSubmission') void consumePending();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void consumePending();
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onMessage);
    }
    document.addEventListener('visibilitychange', onVis);
    void consumePending();

    return () => {
      cancelled = true;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
      }
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [navigate, setSelectedConsentSubmissionId]);

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

      {/* Modals & drawers — each in its OWN Suspense boundary. A single
          shared boundary causes a real bug: when any one lazy chunk
          starts loading (e.g. user taps Edit on a booking detail to
          open BookingForm), the whole boundary renders the `null`
          fallback — unmounting whichever drawer is *already* open,
          killing exit animations, and making the Toast/feedback prompt
          briefly disappear. Per-child boundaries scope each suspension
          to just that child, so opening one drawer never disturbs the
          others. (Reported as "taps are blocked" — when the visible UI
          flickers out for 100-300 ms, taps during that window land on
          surprise targets beneath.) */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {selectedBookingId && <BookingDrawer />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {bookingFormOpen && <BookingForm />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {agentPanelOpen && <AgentPanel />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {searchOpen && <SearchOverlay />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {selectedConversationId && <ConversationDrawer />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {selectedConsentSubmissionId && <ConsentFormDrawer />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {attachToBookingSubmissionId && <BookingPickerDrawer />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {finalizeSubmissionId && <FinalizeFormDrawer />}
        </AnimatePresence>
      </Suspense>

      <Suspense fallback={null}>
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
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {editingClient && <ClientForm client={editingClient} onClose={() => setEditingClientId(null)} />}
        </AnimatePresence>
      </Suspense>

      {/* Always-rendered overlays in their own boundaries so a modal's
          chunk load doesn't unmount an in-flight toast or the agent's
          post-exchange feedback prompt. */}
      <Suspense fallback={null}>
        <AgentFeedbackPrompt />
      </Suspense>
      <Suspense fallback={null}>
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
