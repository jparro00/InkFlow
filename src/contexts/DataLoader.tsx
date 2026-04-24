import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useImageStore } from '../stores/imageStore';
import { useDocumentStore } from '../stores/documentStore';
import { useMessageStore } from '../stores/messageStore';
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

  useEffect(() => {
    if (!session) return;

    // Critical data — fire in parallel so the slowest fetch sets the floor,
    // not the sum.
    const imagesDone = fetchImages();
    fetchClients();
    fetchBookings();
    fetchDocuments();
    fetchConversations();
    startRealtime();

    // Non-critical work — wait for the browser to be idle so we don't
    // compete with the critical fetches for bandwidth / main-thread time.
    const idle = (cb: () => void) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(cb, { timeout: 2000 });
      } else {
        setTimeout(cb, 200);
      }
    };
    idle(() => {
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
    });

    return () => stopRealtime();
  }, [session, fetchClients, fetchBookings, fetchImages, fetchDocuments, fetchConversations, startRealtime, stopRealtime]);

  return <>{children}</>;
}
