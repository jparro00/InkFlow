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
    fetchClients();
    fetchBookings();
    // Re-enqueue uploads that were interrupted by a previous app close once
    // fetchImages resolves and the store reflects the latest remote status.
    fetchImages().then(() => resumePendingImageUploads());
    fetchDocuments();
    fetchConversations();
    startRealtime();
    // Prefetch all lazy-loaded route chunks so tab switches are instant.
    // Without this, the first visit to each tab on PWA/mobile stalls 3-5s
    // while the browser downloads the JS chunk over the network.
    import('../pages/Clients');
    import('../pages/ClientDetail');
    import('../pages/Messages');
    import('../pages/Settings');
    import('../pages/Theme');
    import('../pages/Feedback');
    return () => stopRealtime();
  }, [session, fetchClients, fetchBookings, fetchImages, fetchDocuments, fetchConversations, startRealtime, stopRealtime]);

  return <>{children}</>;
}
