import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Edit, Plus, MessageCircle, FileText, Trash2, X, Camera, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useClientStore } from '../stores/clientStore';
import { useBookingStore } from '../stores/bookingStore';
import { useImageStore } from '../stores/imageStore';
import { useDocumentStore } from '../stores/documentStore';
import { useMessageStore } from '../stores/messageStore';
import { useUIStore } from '../stores/uiStore';
import { getSignedUrl } from '../services/documentService';
import { useImageThumbnails, useDocumentImageThumbnails } from '../hooks/useBookingImages';
import ImageViewer from '../components/booking/ImageViewer';
import { getTypeColor } from '../types';

type Tab = 'overview' | 'appointments' | 'photos' | 'documents' | 'notes';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clients = useClientStore((s) => s.clients);
  const client = useMemo(() => clients.find((c) => c.id === id), [clients, id]);
  const addNote = useClientStore((s) => s.addNote);
  const deleteClient = useClientStore((s) => s.deleteClient);
  const uploadAvatar = useClientStore((s) => s.uploadAvatar);
  const removeAvatar = useClientStore((s) => s.removeAvatar);
  const linkedProfiles = useClientStore((s) => s.linkedProfiles);
  const allBookings = useBookingStore((s) => s.bookings);
  const clientBookings = useMemo(() => allBookings.filter((b) => b.client_id === id), [allBookings, id]);
  const allBookingImages = useImageStore((s) => s.images);
  const allDocuments = useDocumentStore((s) => s.documents);
  const clientDocuments = useMemo(() => allDocuments.filter((d) => d.client_id === id), [allDocuments, id]);
  const removeDocument = useDocumentStore((s) => s.removeDocument);
  const uploadDocument = useDocumentStore((s) => s.uploadDocument);
  const { setSelectedBookingId, setSelectedConversationId, openBookingForm, setPrefillBookingData, setEditingClientId, addToast, setConfirmDialogOpen } = useUIStore();
  const conversations = useMessageStore((s) => s.conversations);
  const [tab, setTab] = useState<Tab>('overview');
  const [noteText, setNoteText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  const [viewingDocPhotoId, setViewingDocPhotoId] = useState<string | null>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Tell the shell to hide the FAB while the delete confirm is visible so
  // the bot button doesn't visually cover the "Yes, delete" action.
  useEffect(() => {
    setConfirmDialogOpen(confirmDelete);
    return () => setConfirmDialogOpen(false);
  }, [confirmDelete, setConfirmDialogOpen]);

  // Photos: booking_images from this client's bookings + document uploads with type=image.
  // All hooks must run before any early return to satisfy rules-of-hooks, so
  // derived state like the photo thumbnails is computed here even when the
  // client lookup fails (in which case these produce empty results).
  const clientBookingIds = useMemo(() => new Set(clientBookings.map((b) => b.id)), [clientBookings]);
  const bookingPhotos = useMemo(
    () => allBookingImages.filter((img) => clientBookingIds.has(img.booking_id)),
    [allBookingImages, clientBookingIds]
  );
  const { thumbnails: bookingThumbnails, getOriginalUrl: getBookingOriginalUrl } =
    useImageThumbnails(bookingPhotos);
  const docPhotos = useMemo(
    () => clientDocuments.filter((d) => d.type === 'image'),
    [clientDocuments]
  );
  const { thumbnails: docPhotoThumbnails, getOriginalUrl: getDocPhotoOriginalUrl } =
    useDocumentImageThumbnails(docPhotos);
  const docs = useMemo(
    () => clientDocuments.filter((d) => d.type !== 'image'),
    [clientDocuments]
  );
  // Split Docs tab entries by whether they can render as a thumbnail. Most new
  // uploads are photos (forceType='other'); legacy PDFs / non-image files fall
  // back to a list below the grid so they remain visible + deletable.
  const imageDocs = useMemo(
    () => docs.filter((d) => d.mime_type?.startsWith('image/') ?? false),
    [docs]
  );
  const nonImageDocs = useMemo(
    () => docs.filter((d) => !(d.mime_type?.startsWith('image/') ?? false)),
    [docs]
  );
  const { thumbnails: docThumbnails, getOriginalUrl: getDocOriginalUrl } =
    useDocumentImageThumbnails(imageDocs);

  if (!client) {
    return (
      <div className="p-5">
        <button
          onClick={() => navigate('/clients')}
          className="flex items-center gap-2 text-text-s active:text-text-p mb-4 cursor-pointer press-scale"
        >
          <ArrowLeft size={18} /> Clients
        </button>
        <div className="text-text-t text-sm">Client not found.</div>
      </div>
    );
  }

  const upcoming = clientBookings.filter(
    (b) => new Date(b.date) > new Date() && b.status !== 'Cancelled'
  );
  const sorted = [...clientBookings].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'appointments', label: 'Appts' },
    { key: 'photos', label: 'Photos' },
    { key: 'documents', label: 'Docs' },
    { key: 'notes', label: 'Notes' },
  ];

  const handleNewBooking = () => {
    setPrefillBookingData({ client_id: client.id });
    openBookingForm();
  };

  const handleAddNote = async () => {
    if (noteText.trim()) {
      try {
        await addNote(client.id, noteText.trim());
        setNoteText('');
      } catch (e) {
        console.error('Failed to add note:', e);
      }
    }
  };

  const handleDeleteClient = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteClient(client.id);
      addToast(`Deleted ${client.name}`);
      navigate('/clients');
    } catch (e) {
      console.error('Failed to delete client:', e);
      addToast('Failed to delete client');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="px-5 pt-5 pb-32 lg:px-6 lg:pt-6 lg:pb-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/clients')}
          className="flex items-center gap-2.5 text-text-s active:text-text-p transition-colors cursor-pointer press-scale min-h-[44px]"
        >
          <ArrowLeft size={20} />
          <span className="text-base">Clients</span>
        </button>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-12 h-12 rounded-md flex items-center justify-center border border-border/60 text-text-s active:text-red-400 transition-colors cursor-pointer press-scale"
            aria-label="Delete client"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={() => setEditingClientId(client.id)}
            className="w-12 h-12 rounded-md flex items-center justify-center border border-border/60 text-text-s active:text-text-p transition-colors cursor-pointer press-scale"
          >
            <Edit size={18} />
          </button>
          <button
            onClick={handleNewBooking}
            className="w-12 h-12 rounded-md flex items-center justify-center bg-accent text-bg cursor-pointer press-scale shadow-glow active:shadow-glow-strong"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Profile */}
      <div className="flex items-start gap-4 mb-6">
        {(() => {
          const pic = client.profile_pic
            || (client.instagram && linkedProfiles[client.instagram]?.profilePic)
            || (client.facebook && linkedProfiles[client.facebook]?.profilePic);
          const busy = uploadingAvatar || removingAvatar;
          return (
            <div className="relative shrink-0">
              <label className="relative cursor-pointer press-scale block">
                {/* File input is label-wrapped so iOS Safari opens the picker
                    from a native user gesture; programmatic .click() on a
                    hidden input is unreliable there. */}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setUploadingAvatar(true);
                    try {
                      await uploadAvatar(client.id, file);
                    } catch (err) {
                      console.error('Avatar upload failed', err);
                      addToast('Could not upload photo. Try a smaller image.');
                    } finally {
                      setUploadingAvatar(false);
                    }
                  }}
                />
                {pic ? (
                  <img src={pic} alt={client.name} className="w-16 h-16 rounded-2xl object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent text-xl font-medium">
                    {client.name.charAt(0)}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-surface border border-border/60 rounded-full flex items-center justify-center text-text-s">
                  {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                </div>
              </label>
              {client.profile_pic && !uploadingAvatar && (
                <button
                  type="button"
                  disabled={removingAvatar}
                  onClick={async () => {
                    setRemovingAvatar(true);
                    try {
                      await removeAvatar(client.id);
                    } catch (err) {
                      console.error('Avatar remove failed', err);
                      addToast('Could not remove photo.');
                    } finally {
                      setRemovingAvatar(false);
                    }
                  }}
                  className="absolute -top-1 -right-1 w-7 h-7 bg-surface border border-border/60 rounded-full flex items-center justify-center text-text-s press-scale z-10"
                  aria-label="Remove photo"
                >
                  {removingAvatar ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                </button>
              )}
            </div>
          );
        })()}
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-text-p truncate">{client.name}</h1>
          <div className="text-base text-text-s mt-1 truncate">
            {[
              client.phone,
              client.instagram && linkedProfiles[client.instagram]?.name,
              client.facebook && linkedProfiles[client.facebook]?.name,
            ].filter(Boolean).join(' · ')}
          </div>
          <div className="text-sm text-text-t mt-1.5">
            {clientBookings.length} session{clientBookings.length !== 1 ? 's' : ''}
            {upcoming.length > 0 && ` · ${upcoming.length} upcoming`}
            {client.dob && ` · Born ${format(new Date(client.dob), 'MMM d, yyyy')}`}
          </div>
          {client.tags.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {client.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 text-xs rounded-md bg-surface text-text-t border border-border/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-0 overflow-x-auto border-b border-border/40 mb-6 -mx-5 px-5 lg:mx-0 lg:px-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3.5 text-base transition-colors cursor-pointer whitespace-nowrap border-b-2 min-h-[48px] ${
              tab === t.key
                ? 'text-accent border-accent'
                : 'text-text-t active:text-text-s border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 max-w-xl">
          {[
            { label: 'Phone', value: client.phone },
            { label: 'Instagram', value: client.instagram ? linkedProfiles[client.instagram]?.name : undefined, psid: client.instagram, pic: client.instagram ? linkedProfiles[client.instagram]?.profilePic : undefined },
            { label: 'Facebook', value: client.facebook ? linkedProfiles[client.facebook]?.name : undefined, psid: client.facebook, pic: client.facebook ? linkedProfiles[client.facebook]?.profilePic : undefined },
            { label: 'Date of Birth', value: client.dob ? format(new Date(client.dob), 'MMM d, yyyy') : undefined },
          ]
            .filter((f) => f.value)
            .map((f) =>
              f.psid ? (
                <button
                  key={f.label}
                  onClick={() => {
                    const match = conversations.find((c) => c.participantPsid === f.psid);
                    if (match) {
                      setSelectedConversationId(match.id);
                    } else {
                      navigate('/messages', { state: { openPsid: f.psid } });
                    }
                  }}
                  className="w-full text-left bg-surface/60 rounded-lg p-5 border border-border/30 cursor-pointer press-scale active:bg-elevated/40 transition-colors"
                >
                  <div className="text-sm text-text-t uppercase tracking-wider mb-1.5 font-medium">{f.label}</div>
                  <div className="flex items-center gap-3 text-base text-accent">
                    {f.pic ? (
                      <img src={f.pic} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-accent/10 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{f.value}</span>
                    <MessageCircle size={16} className="shrink-0" />
                  </div>
                </button>
              ) : (
                <div key={f.label} className="bg-surface/60 rounded-lg p-5 border border-border/30">
                  <div className="text-sm text-text-t uppercase tracking-wider mb-1.5 font-medium">{f.label}</div>
                  <div className="text-base text-text-p">{f.value}</div>
                </div>
              )
            )}

          {upcoming.length > 0 && (
            <div className="lg:col-span-2 bg-accent-glow rounded-lg p-5 border border-accent/10">
              <div className="text-sm text-text-t uppercase tracking-wider mb-2 font-medium">Next Appointment</div>
              <button
                onClick={() => setSelectedBookingId(upcoming[0].id)}
                className="text-base text-text-p active:text-accent transition-colors cursor-pointer press-scale min-h-[44px] text-left"
              >
                {upcoming[0].type} &middot; {format(new Date(upcoming[0].date), 'MMM d, yyyy h:mm a')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Appointments */}
      {tab === 'appointments' && (
        <div className="space-y-1">
          {sorted.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBookingId(b.id)}
              className="w-full text-left flex items-center gap-4 px-5 py-4 rounded-lg active:bg-elevated/40 transition-colors cursor-pointer press-scale min-h-[64px]"
            >
              <div className="flex-1 min-w-0" style={{ borderLeftWidth: 3, borderLeftColor: getTypeColor(b.type), paddingLeft: 12 }}>
                <div className="text-base text-text-p truncate">
                  {b.type}
                </div>
                <div className="text-sm text-text-s mt-1">
                  {format(new Date(b.date), 'MMM d, yyyy')} · {b.duration}h
                </div>
              </div>
              <span className="text-sm text-text-t shrink-0">{b.status}</span>
            </button>
          ))}
          {sorted.length === 0 && (
            <div className="text-center py-12 text-text-t text-sm">No appointments yet.</div>
          )}
        </div>
      )}

      {/* Photos */}
      {tab === 'photos' && (
        <div>
          <div className="flex justify-end mb-4">
            {/* <label>-wrapped input instead of button + ref.click() so the file
                picker opens from a native user gesture on Safari/iOS PWA where
                programmatic .click() on display:none inputs is unreliable. */}
            <label
              className={`flex items-center gap-2 px-4 py-2.5 rounded-md bg-accent text-bg text-sm cursor-pointer press-scale shadow-glow active:shadow-glow-strong min-h-[40px] ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Plus size={16} />
              <span>{uploadingPhoto ? 'Uploading…' : 'Add Photo'}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploadingPhoto}
                onChange={async (e) => {
                  if (!e.target.files?.length) return;
                  setUploadingPhoto(true);
                  try {
                    for (const file of Array.from(e.target.files)) {
                      await uploadDocument(file, client.id);
                    }
                  } catch (err) {
                    console.error('Failed to upload photo:', err);
                    addToast('Upload failed');
                  } finally {
                    setUploadingPhoto(false);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </label>
          </div>
          {bookingThumbnails.length > 0 && (
            <div className="mb-6">
              <div className="text-sm text-text-t uppercase tracking-wider mb-3 font-medium">From Bookings</div>
              <div className="grid grid-cols-3 gap-2">
                {bookingThumbnails.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setViewingImageId(t.id)}
                    className="aspect-square rounded-lg bg-surface border border-border/30 overflow-hidden cursor-pointer press-scale"
                  >
                    <img
                      src={t.url}
                      alt={t.filename}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          {docPhotos.length > 0 && (
            <div className="mb-6">
              <div className="text-sm text-text-t uppercase tracking-wider mb-3 font-medium">Uploaded Photos</div>
              <div className="grid grid-cols-3 gap-2">
                {docPhotos.map((doc) => {
                  const thumb = docPhotoThumbnails.find((t) => t.id === doc.id);
                  return (
                    <div key={doc.id} className="relative aspect-square rounded-lg bg-surface border border-border/30 overflow-hidden">
                      <button
                        onClick={() => thumb && setViewingDocPhotoId(doc.id)}
                        disabled={!thumb}
                        className="w-full h-full cursor-pointer press-scale disabled:cursor-default"
                      >
                        {thumb ? (
                          <img
                            src={thumb.url}
                            alt={thumb.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-text-t">
                            Loading…
                          </div>
                        )}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeDocument(doc); }}
                        aria-label="Delete photo"
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-bg/80 flex items-center justify-center text-text-s active:text-danger transition-colors cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {bookingThumbnails.length === 0 && bookingPhotos.length > 0 && (
            <div className="mb-6">
              <div className="text-sm text-text-t uppercase tracking-wider mb-3 font-medium">From Bookings</div>
              <div className="text-xs text-text-t bg-surface/60 rounded-lg p-4 border border-border/30">
                {bookingPhotos.length} image{bookingPhotos.length === 1 ? '' : 's'} still syncing from another device.
              </div>
            </div>
          )}
          {bookingPhotos.length === 0 && docPhotos.length === 0 && (
            <div className="text-center py-16 text-text-t text-sm">No photos yet.</div>
          )}
        </div>
      )}

      <AnimatePresence>
        {viewingImageId && (
          <ImageViewer
            thumbnails={bookingThumbnails}
            initialId={viewingImageId}
            getOriginalUrl={getBookingOriginalUrl}
            onClose={() => setViewingImageId(null)}
          />
        )}
        {viewingDocPhotoId && (
          <ImageViewer
            thumbnails={docPhotoThumbnails}
            initialId={viewingDocPhotoId}
            getOriginalUrl={getDocPhotoOriginalUrl}
            onClose={() => setViewingDocPhotoId(null)}
          />
        )}
        {viewingDocId && (
          <ImageViewer
            thumbnails={docThumbnails}
            initialId={viewingDocId}
            getOriginalUrl={getDocOriginalUrl}
            onClose={() => setViewingDocId(null)}
          />
        )}
      </AnimatePresence>

      {/* Documents — same pattern as Photos: native-picker upload, thumbnail
          grid, tap-to-view via ImageViewer, always-visible X. Legacy PDFs /
          non-image files render as a list below the grid. */}
      {tab === 'documents' && (
        <div>
          <div className="flex justify-end mb-4">
            <label
              className={`flex items-center gap-2 px-4 py-2.5 rounded-md bg-accent text-bg text-sm cursor-pointer press-scale shadow-glow active:shadow-glow-strong min-h-[40px] ${uploadingDoc ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Plus size={16} />
              <span>{uploadingDoc ? 'Uploading…' : 'Add Document'}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploadingDoc}
                onChange={async (e) => {
                  if (!e.target.files?.length) return;
                  setUploadingDoc(true);
                  try {
                    for (const file of Array.from(e.target.files)) {
                      await uploadDocument(file, client.id, undefined, 'other');
                    }
                  } catch (err) {
                    console.error('Failed to upload document:', err);
                    addToast('Upload failed');
                  } finally {
                    setUploadingDoc(false);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </label>
          </div>
          {imageDocs.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-6">
              {imageDocs.map((doc) => {
                const thumb = docThumbnails.find((t) => t.id === doc.id);
                return (
                  <div key={doc.id} className="relative aspect-square rounded-lg bg-surface border border-border/30 overflow-hidden">
                    <button
                      onClick={() => thumb && setViewingDocId(doc.id)}
                      disabled={!thumb}
                      className="w-full h-full cursor-pointer press-scale disabled:cursor-default"
                    >
                      {thumb ? (
                        <img
                          src={thumb.url}
                          alt={thumb.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-text-t">
                          Loading…
                        </div>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeDocument(doc); }}
                      aria-label="Delete document"
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-bg/80 flex items-center justify-center text-text-s active:text-danger transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {nonImageDocs.length > 0 && (
            <div className="space-y-2">
              {nonImageDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 bg-surface/60 rounded-lg p-4 border border-border/30">
                  <FileText size={20} className="text-text-t shrink-0" />
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={async () => {
                        const url = await getSignedUrl(doc);
                        window.open(url, '_blank');
                      }}
                      className="text-base text-accent truncate block cursor-pointer press-scale"
                    >
                      {doc.label || 'Untitled'}
                    </button>
                    <div className="text-xs text-text-t mt-0.5">
                      {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      {doc.booking_id && (() => {
                        const b = clientBookings.find((bk) => bk.id === doc.booking_id);
                        return b ? ` · ${b.type}` : '';
                      })()}
                    </div>
                  </div>
                  <button
                    onClick={() => removeDocument(doc)}
                    aria-label="Delete document"
                    className="w-9 h-9 rounded-md flex items-center justify-center text-text-t active:text-danger transition-colors cursor-pointer press-scale shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {docs.length === 0 && (
            <div className="text-center py-16 text-text-t text-sm">No documents yet.</div>
          )}
        </div>
      )}

      {/* Notes */}
      {tab === 'notes' && (
        <div>
          <div className="flex gap-3 mb-6">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="flex-1 bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 resize-none transition-colors"
            />
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim()}
              className="px-5 bg-accent text-bg text-base rounded-md cursor-pointer press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow active:shadow-glow-strong self-end py-3.5 min-h-[48px]"
            >
              Add
            </button>
          </div>

          <div className="space-y-3">
            {client.notes.map((note, i) => (
              <div key={i} className="bg-surface/60 rounded-lg p-5 border border-border/30">
                <div className="text-xs text-text-t mb-2.5 uppercase tracking-wider font-medium">
                  {format(new Date(note.ts), 'MMM d, yyyy h:mm a')}
                </div>
                <div className="text-base text-text-s leading-relaxed">{note.text}</div>
              </div>
            ))}
            {client.notes.length === 0 && (
              <div className="text-center py-12 text-text-t text-sm">No notes yet.</div>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          // pb-[116px] keeps the dialog card above the 100px mobile tab bar
          // (matches the FAB's bottom-[116px] anchor). lg:pb-0 centers it on
          // desktop where there is no tab bar.
          className="fixed inset-0 z-[100] bg-black/60 flex items-end lg:items-center justify-center px-4 pb-[116px] lg:pb-0"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="bg-surface border border-border/60 rounded-2xl p-5 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl text-text-p mb-2">Delete {client.name}?</h2>
            <p className="text-[14px] text-text-s mb-5">
              {clientBookings.length > 0
                ? `This will also remove ${clientBookings.length} booking${clientBookings.length === 1 ? '' : 's'} and all associated history. This can't be undone.`
                : `This can't be undone.`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-lg bg-surface/60 border border-border/40 text-text-s font-medium text-[14px] active:bg-surface transition-colors cursor-pointer press-scale disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteClient}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 font-medium text-[14px] active:bg-red-500/25 transition-colors cursor-pointer press-scale disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
