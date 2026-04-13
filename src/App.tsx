import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import CalendarPage from './pages/Calendar';
import ClientsPage from './pages/Clients';
import ClientDetailPage from './pages/ClientDetail';
import SettingsPage from './pages/Settings';
import MessagesPage from './pages/Messages';
import ThemePage from './pages/Theme';
import LoginPage from './pages/Login';
import { useUIStore } from './stores/uiStore';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useClientStore } from './stores/clientStore';
import { useBookingStore } from './stores/bookingStore';
import { useImageStore } from './stores/imageStore';

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

  return (
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
