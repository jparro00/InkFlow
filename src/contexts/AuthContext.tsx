import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

// Read the persisted Supabase session synchronously from localStorage so we
// can render the app optimistically on cold start instead of waiting for
// supabase.auth.getSession() (which performs a token-refresh round-trip).
// If the persisted session turns out to be invalid or expired, the
// onAuthStateChange listener clears it below and ProtectedRoute redirects.
function readPersistedSession(): Session | null {
  try {
    const raw = localStorage.getItem('inkbloop-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? null;
    if (!session?.access_token) return null;
    // Treat already-expired tokens as no session — Supabase will refresh
    // them on its own once the SDK boots, but we shouldn't render the app
    // shell against credentials we know are stale.
    const expiresAt = session.expires_at;
    if (typeof expiresAt === 'number' && expiresAt * 1000 < Date.now()) {
      return null;
    }
    return session as Session;
  } catch {
    return null;
  }
}

// Lazy-load the Supabase SDK so the ~50 KB gzipped chunk stays off the
// cold critical path. The App renders against the persisted session
// immediately; the SDK loads in the background to validate, refresh, and
// install the auth-state-change listener. If the user lands on /login,
// the Login chunk imports lib/supabase directly so the SDK loads with it.
async function loadSupabase() {
  const mod = await import('../lib/supabase');
  return mod.supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const persisted = typeof window !== 'undefined' ? readPersistedSession() : null;
  const [session, setSession] = useState<Session | null>(persisted);
  // If we already have a plausible session, show the app immediately and
  // let the SDK validate in the background. Only block on cold-start
  // BootSplash when there's nothing in storage to render against.
  const [loading, setLoading] = useState(!persisted);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    loadSupabase().then((supabase) => {
      if (cancelled) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        setSession(session);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (cancelled) return;
          setSession(session);
          setLoading(false);
        }
      );
      unsubscribe = () => subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await loadSupabase();
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
