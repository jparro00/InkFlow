import { useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Lazy-load every route — keeps the main bundle minimal.
// DataLoader pulls in the five feature stores + imageSync; lazy-loading it
// keeps all that code out of the login/cold-boot critical path.
const LoginPage = lazy(() => import('./pages/Login'));
const AppShell = lazy(() => import('./components/layout/AppShell'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const ClientsPage = lazy(() => import('./pages/Clients'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetail'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const MessagesPage = lazy(() => import('./pages/Messages'));
const ThemePage = lazy(() => import('./pages/Theme'));
const FeedbackPage = lazy(() => import('./pages/Feedback'));
const FormsPage = lazy(() => import('./pages/Forms'));
const ConsentSubmitPage = lazy(() => import('./pages/ConsentSubmit'));
const DataLoader = lazy(() => import('./contexts/DataLoader'));

// Matches the inline #boot-splash in index.html so there is no visual flash
// between the HTML splash and the first React render. Both reference the
// same /logo.svg and the same Moss bg so the transition is invisible.
function BootSplash() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#121212',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src="/logo.svg"
        width={120}
        height={120}
        alt=""
        aria-hidden
        style={{ animation: 'boot-pulse 1.4s ease-in-out infinite' }}
      />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <BootSplash />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  // Cmd/Ctrl+K opens the global search. Done with a lazy import so the
  // uiStore doesn't end up in the main/login bundle just for this shortcut.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        import('./stores/uiStore').then((m) => m.useUIStore.getState().setSearchOpen(true));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Prevent browser back/forward swipe gestures (edge swipe)
  useEffect(() => {
    const edgeWidth = 30;
    const onTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      if (x < edgeWidth || x > window.innerWidth - edgeWidth) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => document.removeEventListener('touchstart', onTouchStart);
  }, []);

  return (
    <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Public consent-form route — no auth, no DataLoader. The artist
            scans-in is anonymous; everything is gated server-side by
            consent-* edge functions. */}
        <Route path="/consent/:artistId" element={<ConsentSubmitPage />} />
        <Route
          element={
            <ProtectedRoute>
              <DataLoader>
                <AppShell />
              </DataLoader>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<CalendarPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/theme" element={<ThemePage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/forms" element={<FormsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </AuthProvider>
  );
}
