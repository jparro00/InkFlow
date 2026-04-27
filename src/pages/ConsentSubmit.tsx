// Public consent-form wizard for clients (no Supabase session). Lives outside
// ProtectedRoute. Two steps after the welcome:
//
//   1. snap_id     — capture the license photo. The blob is uploaded to R2
//                    immediately on Next so Textract can run while the user
//                    fills out the form.
//   2. fill_form   — name + DOB at the top, waiver checkboxes + signature
//                    below. Submit fires straight from here; there's no
//                    review step (the artist reviews on their side).

import { useState, useRef, useMemo, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Check, Download, FileSignature } from 'lucide-react';
import {
  LicenseImageSection,
  LicenseFieldsSection,
  TattooDetailsSection,
  WaiverChecksSection,
  SignatureSection,
} from '../components/forms/ConsentFormSections';
import {
  REQUIRED_WAIVER_KEYS,
  emptyLicenseFields,
  emptyTattooDetails,
  emptyWaiverChecks,
  type LicenseFieldsValue,
  type TattooDetailsValue,
  type WaiverChecksValue,
} from '../components/forms/consentFormSchema';
import type { SignaturePadHandle } from '../components/forms/SignaturePad';
import { blobToDataUrl, generateConsentPdfBlob } from '../components/forms/ConsentPDF';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Step = 'welcome' | 'snap_id' | 'fill_form' | 'done';

async function callConsentUploadUrl(params: {
  artist_id: string;
  submission_id: string;
  kind: 'license' | 'signature' | 'pdf';
  content_type: string;
  content_length: number;
}): Promise<{ url: string; key: string; headers: Record<string, string> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/consent-upload-url`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upload-url failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function uploadToR2(url: string, headers: Record<string, string>, blob: Blob): Promise<void> {
  const res = await fetch(url, { method: 'PUT', headers, body: blob });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
}

async function callConsentAnalyzeId(params: {
  artist_id: string;
  submission_id: string;
  license_key: string;
}): Promise<{ fields: Partial<LicenseFieldsValue>; raw: unknown } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/consent-analyze-id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      console.warn('analyze-id failed', res.status, await res.text().catch(() => ''));
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn('analyze-id error', e);
    return null;
  }
}

async function callConsentSubmit(payload: {
  artist_id: string;
  submission_id: string;
  license: { image_key: string | null; first_name: string; last_name: string; dob: string };
  form_data: WaiverChecksValue;
  signature_image_key: string | null;
  pdf_key: string | null;
  tattoo_location: string;
  tattoo_description: string;
  license_raw_data?: unknown;
}): Promise<{ id: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/consent-submit`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`submit failed: ${res.status} ${text}`);
  }
  return res.json();
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export default function ConsentSubmitPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const submissionId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState<Step>('welcome');

  // License capture state
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licensePreviewUrl, setLicensePreviewUrl] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [licenseRaw, setLicenseRaw] = useState<unknown>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrSucceeded, setOcrSucceeded] = useState(false);

  // Form state
  const [licenseFields, setLicenseFields] = useState<LicenseFieldsValue>(emptyLicenseFields);
  const [tattoo, setTattoo] = useState<TattooDetailsValue>(emptyTattooDetails);
  const [waiver, setWaiver] = useState<WaiverChecksValue>(emptyWaiverChecks);

  // Signature: ref grabs the blob lazily inside handleSubmit. We don't keep
  // it in state any more — there's no preview step that needs to render it.
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The signed PDF kept in memory after submit so the client can download
  // their copy from the done screen. R2 reads require an artist JWT (the
  // images worker), so we can't fetch the uploaded blob back from the public
  // page — keeping the local Blob URL is the only download path.
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (pdfDownloadUrl) URL.revokeObjectURL(pdfDownloadUrl);
    };
  }, [pdfDownloadUrl]);

  if (!artistId || !isUuid(artistId)) {
    return <Navigate to="/login" replace />;
  }

  const handlePickFile = (file: File) => {
    setLicenseFile(file);
    setLicenseKey(null);
    setLicenseRaw(null);
    setOcrSucceeded(false);
    const reader = new FileReader();
    reader.onload = () =>
      setLicensePreviewUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const uploadAndAnalyzeLicense = async () => {
    if (!licenseFile) return;
    setAnalyzing(true);
    setError(null);
    try {
      const upload = await callConsentUploadUrl({
        artist_id: artistId,
        submission_id: submissionId,
        kind: 'license',
        content_type: licenseFile.type || 'image/jpeg',
        content_length: licenseFile.size,
      });
      await uploadToR2(upload.url, upload.headers, licenseFile);
      setLicenseKey(upload.key);

      const analyzed = await callConsentAnalyzeId({
        artist_id: artistId,
        submission_id: submissionId,
        license_key: upload.key,
      });
      if (analyzed?.fields) {
        const f = analyzed.fields;
        // Only pre-fill empty fields — if the user already typed something
        // before OCR returned, don't clobber it.
        setLicenseFields((prev) => ({
          first_name: prev.first_name || f.first_name || '',
          last_name: prev.last_name || f.last_name || '',
          dob: prev.dob || f.dob || '',
        }));
        setLicenseRaw(analyzed.raw);
        setOcrSucceeded(true);
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'License upload failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAdvanceFromSnap = () => {
    setStep('fill_form');
    if (!licenseKey) uploadAndAnalyzeLicense();
  };

  const allRequiredChecked = REQUIRED_WAIVER_KEYS.every((k) => waiver[k] === true);
  const personalInfoFilled =
    licenseFields.first_name.trim() &&
    licenseFields.last_name.trim() &&
    licenseFields.dob;
  const tattooFilled = tattoo.location.trim() && tattoo.description.trim();

  const canSubmitFill = personalInfoFilled && tattooFilled && allRequiredChecked && !signatureEmpty;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Last-chance license upload if Textract step somehow didn't.
      let licenseKeyToSubmit = licenseKey;
      if (!licenseKeyToSubmit && licenseFile) {
        const upload = await callConsentUploadUrl({
          artist_id: artistId,
          submission_id: submissionId,
          kind: 'license',
          content_type: licenseFile.type || 'image/jpeg',
          content_length: licenseFile.size,
        });
        await uploadToR2(upload.url, upload.headers, licenseFile);
        licenseKeyToSubmit = upload.key;
      }

      // Signature upload — grab the blob fresh from the pad.
      let signatureKey: string | null = null;
      const sigBlob = (await signatureRef.current?.toBlob()) ?? null;
      if (sigBlob) {
        const upload = await callConsentUploadUrl({
          artist_id: artistId,
          submission_id: submissionId,
          kind: 'signature',
          content_type: 'image/png',
          content_length: sigBlob.size,
        });
        await uploadToR2(upload.url, upload.headers, sigBlob);
        signatureKey = upload.key;
      }

      // Generate the signed consent PDF locally and upload it to R2. The PDF
      // is the legal record — structured fields land on the row for
      // queryability but the artist downloads / archives the PDF.
      const signedAt = new Date();
      const signatureDataUrl = sigBlob ? await blobToDataUrl(sigBlob) : null;
      const studioName = (typeof localStorage !== 'undefined'
        ? localStorage.getItem('inkbloop-studio-name')
        : null) ?? '';
      const pdfBlob = await generateConsentPdfBlob({
        studioName,
        signedAt,
        license: {
          first_name: licenseFields.first_name.trim(),
          last_name: licenseFields.last_name.trim(),
          dob: licenseFields.dob,
        },
        tattoo: {
          location: tattoo.location.trim(),
          description: tattoo.description.trim(),
        },
        waiver,
        signatureDataUrl,
        audit: {
          userAgent: navigator.userAgent,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      let pdfKey: string | null = null;
      const pdfUpload = await callConsentUploadUrl({
        artist_id: artistId,
        submission_id: submissionId,
        kind: 'pdf',
        content_type: 'application/pdf',
        content_length: pdfBlob.size,
      });
      await uploadToR2(pdfUpload.url, pdfUpload.headers, pdfBlob);
      pdfKey = pdfUpload.key;

      // Hold a local download URL for the done screen. The client can't fetch
      // their PDF back from R2 (auth-gated to the artist) so this is the only
      // path to "download a copy".
      setPdfDownloadUrl(URL.createObjectURL(pdfBlob));

      await callConsentSubmit({
        artist_id: artistId,
        submission_id: submissionId,
        license: {
          image_key: licenseKeyToSubmit,
          first_name: licenseFields.first_name.trim(),
          last_name: licenseFields.last_name.trim(),
          dob: licenseFields.dob,
        },
        form_data: waiver,
        signature_image_key: signatureKey,
        pdf_key: pdfKey,
        tattoo_location: tattoo.location.trim(),
        tattoo_description: tattoo.description.trim(),
        license_raw_data: licenseRaw,
      });

      setStep('done');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // 100dvh tracks the visual viewport: when iOS Safari shows or hides its
    // URL bar, our layout doesn't shift underneath the user — the submit
    // button stays where their finger is going. Combined with the form
    // wrapper below this prevents the "tap submit, URL bar appears, tap
    // again" double-press iOS double-press behavior.
    <div className="min-h-[100dvh] bg-bg flex flex-col">
      <header className="px-5 pt-8 pb-4 flex items-center gap-3 max-w-2xl w-full mx-auto">
        <FileSignature size={22} className="text-accent" />
        <h1 className="font-display text-xl text-text-p">Consent form</h1>
      </header>

      <div className="flex-1 px-5 pb-24 max-w-2xl w-full mx-auto">
        {step === 'welcome' && (
          <div className="pt-12 text-center">
            <h2 className="font-display text-2xl text-text-p mb-3">Before your tattoo</h2>
            <p className="text-md text-text-s leading-relaxed mb-8">
              We need a photo of your government ID, your name and date of birth, and a quick waiver. About 2 minutes.
            </p>
            <button
              onClick={() => setStep('snap_id')}
              className="w-full py-4 text-md bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong min-h-[52px]"
            >
              Get started
            </button>
          </div>
        )}

        {step === 'snap_id' && (
          <div className="pt-4 space-y-6">
            <LicenseImageSection
              mode="fill"
              imagePreviewUrl={licensePreviewUrl}
              onPickFile={handlePickFile}
            />
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('welcome')}
                className="flex-1 py-3.5 text-md text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                Back
              </button>
              <button
                onClick={handleAdvanceFromSnap}
                disabled={!licenseFile}
                className="flex-1 py-3.5 text-md bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'fill_form' && (
          // Wrapping in a <form> with onSubmit handles the iOS edge case
          // where tapping a plain button while a date / text input is focused
          // dismisses the keyboard first and the click misses. With form
          // semantics iOS commits the submission cleanly on the first tap.
          <form
            className="pt-4 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              if (canSubmitFill && !submitting) handleSubmit();
            }}
          >
            <LicenseFieldsSection mode="fill" value={licenseFields} onChange={setLicenseFields} />

            {analyzing && (
              <div className="bg-surface/60 rounded-lg border border-border/30 p-3 text-base text-text-s">
                Reading your ID — fields will pre-fill in a moment.
              </div>
            )}
            {!analyzing && ocrSucceeded && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-base text-text-s">
                We pulled your name and date of birth from your ID. Please double-check.
              </div>
            )}

            <TattooDetailsSection value={tattoo} onChange={setTattoo} />
            <WaiverChecksSection mode="fill" value={waiver} onChange={setWaiver} />
            <SignatureSection
              mode="fill"
              signatureRef={signatureRef}
              defaultName={`${licenseFields.first_name} ${licenseFields.last_name}`.trim()}
              onChange={setSignatureEmpty}
            />

            {error && <div className="text-base text-danger">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('snap_id')}
                disabled={submitting}
                className="flex-1 py-3.5 text-md text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all disabled:opacity-40 min-h-[48px]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!canSubmitFill || submitting}
                className="flex-1 py-3.5 text-md bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="pt-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/15 border border-success/40 flex items-center justify-center">
              <Check size={32} className="text-success" strokeWidth={2} />
            </div>
            <h2 className="font-display text-2xl text-text-p mb-3">Thanks!</h2>
            <p className="text-md text-text-s leading-relaxed mb-6">
              Your consent form has been submitted. Your artist will review it shortly.
            </p>
            {pdfDownloadUrl && (
              <a
                href={pdfDownloadUrl}
                download="tattoo-consent-form.pdf"
                className="inline-flex items-center gap-2 px-5 py-3.5 text-md text-text-p rounded-md border border-border/60 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                <Download size={18} />
                Download a copy
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
