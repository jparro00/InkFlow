import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSignature, ChevronRight } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { useConsentSubmissionStore } from '../stores/consentSubmissionStore';
import { consentSubmissionDisplayName } from '../types';
import type { ConsentSubmission, ConsentSubmissionStatus } from '../types';

const groupOrder: ConsentSubmissionStatus[] = ['submitted', 'approved_pending', 'finalized'];

const groupTitles: Record<ConsentSubmissionStatus, string> = {
  submitted: 'Awaiting review',
  approved_pending: 'Pending paperwork',
  finalized: 'Finalized',
};

const groupHints: Record<ConsentSubmissionStatus, string> = {
  submitted: 'Review the license and consent form, then approve or reject.',
  approved_pending: 'Approved — payment, tattoo location, and description still to enter.',
  finalized: 'Complete.',
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function FormsPage() {
  const navigate = useNavigate();
  const { setHeaderLeft, setHeaderRight } = useUIStore();
  const submissions = useConsentSubmissionStore((s) => s.submissions);
  const isLoading = useConsentSubmissionStore((s) => s.isLoading);
  const fetchSubmissions = useConsentSubmissionStore((s) => s.fetchSubmissions);

  useEffect(() => {
    setHeaderLeft(null);
    setHeaderRight(null);
    return () => { setHeaderLeft(null); setHeaderRight(null); };
  }, [setHeaderLeft, setHeaderRight]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const grouped = useMemo(() => {
    const out: Record<ConsentSubmissionStatus, ConsentSubmission[]> = {
      submitted: [],
      approved_pending: [],
      finalized: [],
    };
    for (const s of submissions) out[s.status].push(s);
    return out;
  }, [submissions]);

  const isEmpty = submissions.length === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-8 lg:px-6 max-w-2xl">
        <h1 className="font-display text-2xl lg:text-2xl text-text-p mb-2">Forms</h1>
        <p className="text-sm text-text-t mb-6">Consent forms submitted by clients via QR.</p>

        {isEmpty && !isLoading && (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <FileSignature size={36} strokeWidth={1.25} className="text-text-t mb-3" />
            <div className="text-base text-text-s">No consent forms yet.</div>
            <div className="text-sm text-text-t mt-1 max-w-xs">
              When a client scans your QR code and submits a consent form, it'll show up here for review.
            </div>
          </div>
        )}

        {!isEmpty && groupOrder.map((status) => {
          const items = grouped[status];
          if (items.length === 0) return null;
          return (
            <section key={status} className="mb-8">
              <h2 className="text-md text-text-p font-display mb-1">
                {groupTitles[status]}
                <span className="ml-2 text-sm text-text-t font-normal">{items.length}</span>
              </h2>
              <p className="text-sm text-text-t mb-3">{groupHints[status]}</p>
              <div className="space-y-2">
                {items.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/forms/${s.id}`)}
                    className="w-full bg-surface/60 rounded-lg border border-border/30 px-4 py-3.5 flex items-center justify-between cursor-pointer press-scale transition-all active:bg-elevated/40 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-base text-text-p truncate">
                        {consentSubmissionDisplayName(s)}
                      </div>
                      <div className="text-sm text-text-t mt-0.5">
                        Submitted {formatRelative(s.submitted_at)}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-text-t shrink-0 ml-3" />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
