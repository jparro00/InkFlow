import { useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import { useUIStore } from './stores/uiStore';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useClientStore } from './stores/clientStore';
import { useBookingStore } from './stores/bookingStore';
import { useImageStore } from './stores/imageStore';

// Lazy-load heavy routes — only login loads eagerly
const AppShell = lazy(() => import('./components/layout/AppShell'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const ClientsPage = lazy(() => import('./pages/Clients'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetail'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const MessagesPage = lazy(() => import('./pages/Messages'));
const ThemePage = lazy(() => import('./pages/Theme'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-text-t text-sm">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function DataLoader({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const fetchClients = useClientStore((s) => s.fetchClients);
  const fetchBookings = useBookingStore((s) => s.fetchBookings);
  const fetchImages = useImageStore((s) => s.fetchImages);

  useEffect(() => {
    if (session) {
      fetchClients();
      fetchBookings();
      fetchImages();
    }
  }, [session, fetchClients, fetchBookings, fetchImages]);

  return <>{children}</>;
}

function AppContent() {
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearchOpen]);

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
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg">
          <div className="text-text-t text-sm">Loading...</div>
        </div>
      }
    >
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
