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
const DataLoader = lazy(() => import('./contexts/DataLoader'));

// Matches the inline #boot-splash in index.html so there is no visual flash
// between the HTML splash and the first React render.
function BootSplash() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#110D18',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="72" height="69" viewBox="0 0 48 46" fill="none" aria-hidden>
        <path
          fill="#863bff"
          d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
          style={{ animation: 'boot-pulse 1.4s ease-in-out infinite' }}
        />
      </svg>
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
