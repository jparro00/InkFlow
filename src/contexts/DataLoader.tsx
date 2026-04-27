import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useImageStore } from '../stores/imageStore';
import { useDocumentStore } from '../stores/documentStore';
import { useMessageStore } from '../stores/messageStore';
import { useConsentSubmissionStore } from '../stores/consentSubmissionStore';
import { resumePendingImageUploads } from '../lib/imageSync';

export default function DataLoader({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const fetchClients = useClientStore((s) => s.fetchClients);
  const fetchBookings = useBookingStore((s) => s.fetchBookings);
  const fetchImages = useImageStore((s) => s.fetchImages);
  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);
  const fetchConversations = useMessageStore((s) => s.fetchConversations);
  const startRealtime = useMessageStore((s) => s.startRealtime);
  const stopRealtime = useMessageStore((s) => s.stopRealtime);
  const fetchSubmissions = useConsentSubmissionStore((s) => s.fetchSubmissions);

  useEffect(() => {
    if (!session) return;

    // Calendar (the default route) only needs bookings + clients to render.
    // Every other store has `persist` middleware, so its previous-session
    // snapshot is already on screen instantly; the fresh fetches update
    // it once the browser is idle. This keeps first useful paint off the
    // critical path of whichever Supabase round-trip is slowest today.
    fetchClients();
    fetchBookings();

    const idle = (cb: () => void) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(cb, { timeout: 2000 });
      } else {
        setTimeout(cb, 200);
      }
    };
    idle(() => {
      // Non-critical store fetches — Calendar already rendered against the
      // persisted snapshot; these refresh in the background.
      const imagesDone = fetchImages();
      fetchDocuments();
      fetchConversations();
      fetchSubmissions();
      startRealtime();
      // Re-enqueue uploads interrupted by a previous app close. Waits on
      // fetchImages so the upload queue sees the latest remote status.
      imagesDone.then(() => resumePendingImageUploads());
      // Prefetch lazy route chunks so tab switches feel instant.
      import('../pages/Clients');
      import('../pages/ClientDetail');
      import('../pages/Messages');
      import('../pages/Settings');
      import('../pages/Theme');
      import('../pages/Feedback');
      import('../pages/Forms');
    });

    return () => stopRealtime();
  }, [session, fetchClients, fetchBookings, fetchImages, fetchDocuments, fetchConversations, fetchSubmissions, startRealtime, stopRealtime]);

  return <>{children}</>;
}
