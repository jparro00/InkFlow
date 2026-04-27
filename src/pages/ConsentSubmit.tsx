// Public consent-form wizard for clients (no Supabase session). Lives outside
// ProtectedRoute. Three steps after the welcome:
//
//   1. snap_id     — capture the license photo. The blob is uploaded to R2
//                    immediately on Next so Textract can run while the user
//                    fills out the form, and so the review step can use the
//                    same already-uploaded blob without a second PUT.
//   2. fill_form   — name + DOB at the top, waiver checkboxes + signature
//                    below. Single scroll. Email / phone / health questions /
//                    emergency contact are not collected in v1.
//   3. review      — renders the form via the same section components the
//                    artist sees in their review drawer. What the user sees
//                    here is what the artist sees once they tap the row.

import { useState, useRef, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Check, FileSignature } from 'lucide-react';
import {
  LicenseImageSection,
  LicenseFieldsSection,
  WaiverChecksSection,
  SignatureSection,
} from '../components/forms/ConsentFormSections';
import {
  REQUIRED_WAIVER_KEYS,
  emptyLicenseFields,
  emptyWaiverChecks,
  type LicenseFieldsValue,
  type WaiverChecksValue,
} from '../components/forms/consentFormSchema';
import type { SignaturePadHandle } from '../components/forms/SignaturePad';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Step = 'welcome' | 'snap_id' | 'fill_form' | 'review' | 'done';

async function callConsentUploadUrl(params: {
  artist_id: string;
  submission_id: string;
  kind: 'license' | 'signature';
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
  const [waiver, setWaiver] = useState<WaiverChecksValue>(emptyWaiverChecks);

  // Signature: ref for grabbing the blob; signatureBlobUrl set at fill→review
  // transition so the review step can show what they signed without uploading
  // it yet.
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signatureBlobUrl, setSignatureBlobUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleAdvanceFromFill = async () => {
    // Capture signature now so the review step can preview it without
    // uploading. Final upload happens at submit time.
    const blob = await signatureRef.current?.toBlob();
    if (blob) {
      setSignatureBlob(blob);
      // Replace any prior URL so we don't leak.
      setSignatureBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    }
    setStep('review');
  };

  const allRequiredChecked = REQUIRED_WAIVER_KEYS.every((k) => waiver[k] === true);
  const personalInfoFilled =
    licenseFields.first_name.trim() &&
    licenseFields.last_name.trim() &&
    licenseFields.dob;

  const canSubmitFill = personalInfoFilled && allRequiredChecked && !signatureEmpty;

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

      // Signature upload
      let signatureKey: string | null = null;
      const sigBlob = signatureBlob ?? (await signatureRef.current?.toBlob() ?? null);
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
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-5 pt-8 pb-4 flex items-center gap-3 max-w-2xl w-full mx-auto">
        <FileSignature size={22} className="text-accent" />
        <h1 className="font-display text-xl text-text-p">Consent form</h1>
      </header>

      <div className="flex-1 px-5 pb-12 max-w-2xl w-full mx-auto">
        {step === 'welcome' && (
          <div className="pt-12 text-center">
            <h2 className="font-display text-2xl text-text-p mb-3">Before your tattoo</h2>
            <p className="text-base text-text-s leading-relaxed mb-8">
              We need a photo of your government ID, your name and date of birth, and a quick waiver. About 2 minutes.
            </p>
            <button
              onClick={() => setStep('snap_id')}
              className="w-full py-4 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong min-h-[52px]"
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
                className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                Back
              </button>
              <button
                onClick={handleAdvanceFromSnap}
                disabled={!licenseFile}
                className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'fill_form' && (
          <div className="pt-4 space-y-6">
            <LicenseFieldsSection mode="fill" value={licenseFields} onChange={setLicenseFields} />

            {analyzing && (
              <div className="bg-surface/60 rounded-lg border border-border/30 p-3 text-sm text-text-s">
                Reading your ID — fields will pre-fill in a moment.
              </div>
            )}
            {!analyzing && ocrSucceeded && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-sm text-text-s">
                We pulled your name and date of birth from your ID. Please double-check.
              </div>
            )}

            <WaiverChecksSection mode="fill" value={waiver} onChange={setWaiver} />
            <SignatureSection
              mode="fill"
              signatureRef={signatureRef}
              defaultName={`${licenseFields.first_name} ${licenseFields.last_name}`.trim()}
              onChange={setSignatureEmpty}
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('snap_id')}
                className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                Back
              </button>
              <button
                onClick={handleAdvanceFromFill}
                disabled={!canSubmitFill}
                className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="pt-4 space-y-6">
            <p className="text-sm text-text-t">
              This is what your artist will see. Confirm everything looks right, then submit.
            </p>

            <LicenseImageSection
              mode="review"
              imageUrl={licensePreviewUrl}
              hasImage={Boolean(licensePreviewUrl)}
            />
            <LicenseFieldsSection mode="review" value={licenseFields} />
            <WaiverChecksSection mode="review" value={waiver} />
            <SignatureSection
              mode="review"
              signatureUrl={signatureBlobUrl}
              hasSignature={Boolean(signatureBlobUrl)}
            />

            {error && <div className="text-sm text-danger">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('fill_form')}
                disabled={submitting}
                className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all disabled:opacity-40 min-h-[48px]"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="pt-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/15 border border-success/40 flex items-center justify-center">
              <Check size={32} className="text-success" strokeWidth={2} />
            </div>
            <h2 className="font-display text-2xl text-text-p mb-3">Thanks!</h2>
            <p className="text-base text-text-s leading-relaxed">
              Your consent form has been submitted. Your artist will review it shortly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
