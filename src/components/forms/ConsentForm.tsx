// Renders a submitted consent form for the artist's review drawer. Used by:
//   - the artist's ConsentFormDrawer (modal viewer)
//
// The artist sees:
//   - The license image (PII; collapsed behind a "Show ID" toggle once the
//     form has moved past initial review).
//   - The signed PDF (the legal record) rendered as a small inline preview;
//     tap to open fullscreen.
//
// Tattoo location/description, the waiver checks, and the signature all live
// on the PDF — no separate sections in the drawer for those any more. The
// PDF is a legally-binding artifact; pulling the same fields into chrome that
// can drift from the file would muddy that.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, FileText, Maximize2, X, Loader2 } from 'lucide-react';
import { LicenseImageSection } from './ConsentFormSections';
import { useR2Image } from '../../hooks/useR2Image';
import type { ConsentSubmission } from '../../types';

interface Props {
  submission: ConsentSubmission;
}

export default function ConsentForm({ submission }: Props) {
  const licenseUrl = useR2Image(submission.license_image_key);
  // useR2Image is content-type-agnostic — it just creates a blob: URL from
  // whatever the worker returned. PDFs ride the same path.
  const pdfUrl = useR2Image(submission.pdf_key);

  // Once the form is past initial review (approve has happened), the artist
  // doesn't need the ID image staring back at them every time they open the
  // drawer — it's PII they already verified. Default it to hidden behind a
  // Show toggle for approved_pending / finalized; submitted always shows it
  // because that's the moment the artist needs to verify the ID against the
  // client's stated name + DOB.
  const licenseHiddenByDefault = submission.status !== 'submitted';
  const [licenseShown, setLicenseShown] = useState(!licenseHiddenByDefault);

  const [pdfFullscreen, setPdfFullscreen] = useState(false);

  return (
    <div className="space-y-6">
      {licenseShown ? (
        <div>
          <LicenseImageSection
            mode="review"
            imageUrl={licenseUrl}
            hasImage={Boolean(submission.license_image_key)}
          />
          {licenseHiddenByDefault && (
            <button
              type="button"
              onClick={() => setLicenseShown(false)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-t active:text-text-s transition-colors cursor-pointer press-scale"
            >
              <EyeOff size={12} />
              Hide ID
            </button>
          )}
        </div>
      ) : (
        <section>
          <h2 className="font-display text-md text-text-p mb-2">ID / License</h2>
          <button
            type="button"
            onClick={() => setLicenseShown(true)}
            className="w-full rounded-md border border-border/40 border-dashed bg-bg/40 p-6 text-center text-sm text-text-t cursor-pointer press-scale transition-all flex items-center justify-center gap-2 active:bg-surface/40"
          >
            <Eye size={16} />
            Show ID
          </button>
        </section>
      )}

      <PdfPreviewSection
        pdfUrl={pdfUrl}
        hasPdf={Boolean(submission.pdf_key)}
        onFullscreen={() => setPdfFullscreen(true)}
      />

      {pdfFullscreen && pdfUrl && (
        <PdfFullscreenViewer url={pdfUrl} onClose={() => setPdfFullscreen(false)} />
      )}
    </div>
  );
}

interface PdfPreviewSectionProps {
  pdfUrl: string | null;
  hasPdf: boolean;
  onFullscreen: () => void;
}

function PdfPreviewSection({ pdfUrl, hasPdf, onFullscreen }: PdfPreviewSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg text-text-p">Signed form</h2>
        {pdfUrl && (
          <button
            type="button"
            onClick={onFullscreen}
            className="inline-flex items-center gap-1.5 text-sm text-text-s active:text-text-p transition-colors cursor-pointer press-scale"
            aria-label="Open full screen"
          >
            <Maximize2 size={14} />
            Full screen
          </button>
        )}
      </div>
      {pdfUrl ? (
        // Tap-to-fullscreen wrapper. The iframe itself sits behind a
        // pointer-events:none overlay so the parent button captures the tap
        // (otherwise the browser's native PDF viewer eats it).
        <button
          type="button"
          onClick={onFullscreen}
          className="relative block w-full rounded-md overflow-hidden border border-border/40 bg-white cursor-pointer press-scale transition-all"
          style={{ aspectRatio: '8.5 / 11' }}
          aria-label="View full screen"
        >
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
            title="Signed consent PDF"
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          <div className="absolute inset-0 bg-transparent" />
        </button>
      ) : hasPdf ? (
        <div className="rounded-md border border-border/40 bg-bg/40 p-6 flex items-center justify-center text-sm text-text-t">
          <Loader2 size={18} className="animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="rounded-md border border-border/40 border-dashed bg-bg/40 p-6 text-center text-sm text-text-t flex items-center justify-center gap-2">
          <FileText size={16} />
          No signed PDF on file. (Form submitted before PDF generation was added.)
        </div>
      )}
    </section>
  );
}

function PdfFullscreenViewer({ url, onClose }: { url: string; onClose: () => void }) {
  // Keep esc-to-close — feels native for a fullscreen viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-base text-white/90 font-medium">Signed form</span>
        <button
          type="button"
          onClick={onClose}
          className="p-2 -mr-2 text-white/90 active:text-white cursor-pointer press-scale"
          aria-label="Close"
        >
          <X size={22} />
        </button>
      </div>
      <iframe
        src={`${url}#view=Fit`}
        title="Signed consent PDF"
        className="flex-1 w-full bg-white"
      />
    </div>,
    document.body,
  );
}
