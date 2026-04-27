// Public consent-form wizard for clients (no Supabase session). Lives outside
// ProtectedRoute. Five content steps after the welcome:
//
//   1. disclosure       — ESIGN §7001(c) consumer disclosure (right to paper
//                         copy, right to withdraw, scope). Must be agreed to
//                         before any data is collected.
//   2. snap_id          — capture the license photo. The blob is uploaded to
//                         R2 immediately on Next so Textract can run while
//                         the user fills out the form.
//   3. fill_form        — name + DOB + tattoo location/description + waiver
//                         checkboxes. No signature here — that comes later.
//   4. review_and_sign  — generates the consent PDF live from current state,
//                         displays it in an iframe, signature pad below.
//                         "Adopt and Sign" finalizes the bytes the user is
//                         looking at, hashes them, uploads, inserts row.
//   5. done             — thank you + "Download a copy" link.
//
// The PDF is built once in a useEffect that watches the relevant inputs
// (license, tattoo, waiver, signature). Each rebuild swaps the iframe blob
// URL — visually the user watches the document fill in as they sign. The
// SAME bytes that drive the preview also get hashed + uploaded; there is no
// "regenerate after submit" step.
//
// Audit metadata (IP, UA, timezone, signed timestamp, submission_id) is
// captured client-side: IP comes from the consent-upload-url response (the
// edge fn echoes back what it sees in cf-connecting-ip / x-forwarded-for).
// We embed these into the PDF info dict at finalize time so the bytes the
// user signed carry the audit trail.

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Check, Download, FileSignature, Loader2 } from 'lucide-react';
import {
  LicenseImageSection,
  LicenseFieldsSection,
  TattooDetailsSection,
  WaiverChecksSection,
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
import SignaturePad, { type SignaturePadHandle } from '../components/forms/SignaturePad';
import ConsentDisclosure from '../components/forms/ConsentDisclosure';
import PdfPreviewFrame from '../components/forms/PdfPreviewFrame';
import {
  buildConsentPdfBytes,
  sha256Hex,
  type ConsentPDFData,
} from '../components/forms/ConsentPDF';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Step = 'welcome' | 'disclosure' | 'snap_id' | 'fill_form' | 'review_and_sign' | 'done';

interface UploadUrlResponse {
  url: string;
  key: string;
  headers: Record<string, string>;
  client_ip?: string;
  client_user_agent?: string;
}

async function callConsentUploadUrl(params: {
  artist_id: string;
  submission_id: string;
  kind: 'license' | 'signature' | 'pdf';
  content_type: string;
  content_length: number;
}): Promise<UploadUrlResponse> {
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

async function uploadToR2(url: string, headers: Record<string, string>, blob: Blob | Uint8Array): Promise<void> {
  const body: BodyInit = blob instanceof Uint8Array
    ? new Blob([new Uint8Array(blob)])
    : blob;
  const res = await fetch(url, { method: 'PUT', headers, body });
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
  pdf_sha256: string | null;
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

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

export default function ConsentSubmitPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const submissionId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState<Step>('welcome');

  // Disclosure agreement
  const [disclosureAgreed, setDisclosureAgreed] = useState(false);

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

  // Signature: kept as PNG bytes in state (not just on the canvas) so the
  // PDF preview can re-render it whenever it changes. The pad provides a
  // ref-based toBlob() for committing the user's drawing.
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [signaturePngBytes, setSignaturePngBytes] = useState<Uint8Array | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audit data captured from the upload-url response (cf-connecting-ip /
  // x-forwarded-for / user-agent the edge fn saw). Latched on first response;
  // re-checks just keep it in sync if subsequent calls return different data.
  const [clientIp, setClientIp] = useState<string>('');
  const [clientUserAgent, setClientUserAgent] = useState<string>('');

  // Live PDF preview blob URL for the iframe in review_and_sign.
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  // The download URL handed to the client on the done screen — the FINAL
  // signed PDF bytes, kept in memory so they can save a copy.
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
      // Cache the audit fields the edge fn saw — used later when we build
      // the signed PDF so the bytes the user signs carry the IP + UA.
      if (upload.client_ip) setClientIp(upload.client_ip);
      if (upload.client_user_agent) setClientUserAgent(upload.client_user_agent);

      const analyzed = await callConsentAnalyzeId({
        artist_id: artistId,
        submission_id: submissionId,
        license_key: upload.key,
      });
      if (analyzed?.fields) {
        const f = analyzed.fields;
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
  const fillFormReady = Boolean(personalInfoFilled && tattooFilled && allRequiredChecked);

  const studioName = useMemo(() => {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('inkbloop-studio-name') ?? '';
  }, []);

  // Builds a ConsentPDFData snapshot from current state. Re-computed by the
  // useEffect below whenever any of the inputs change.
  const buildPdfData = useCallback((finalize: boolean): ConsentPDFData => {
    return {
      studioName,
      signedAt: new Date(),
      submissionId,
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
      signaturePngBytes: finalize ? signaturePngBytes : signaturePngBytes,
      audit: {
        clientIp,
        userAgent: clientUserAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        timezone: typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : '',
      },
    };
  }, [studioName, submissionId, licenseFields, tattoo, waiver, signaturePngBytes, clientIp, clientUserAgent]);

  // Live preview rebuild while on review_and_sign. Each input change kicks
  // the effect which produces a new blob URL; the previous URL is revoked
  // on cleanup so we don't leak. ~50-100 ms per rebuild on typical hardware.
  useEffect(() => {
    if (step !== 'review_and_sign') return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const bytes = await buildConsentPdfBytes(buildPdfData(false), { finalize: false });
        if (cancelled) return;
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        setPdfPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      } catch (e) {
        if (!cancelled) console.error('preview build failed', e);
      }
    })();
    return () => {
      cancelled = true;
      // Don't revoke createdUrl here — the iframe is still showing it. The
      // setPdfPreviewUrl swap above + the unmount effect below handle it.
    };
  }, [step, buildPdfData]);

  // Revoke the live preview URL when we leave the review step or unmount.
  useEffect(() => {
    return () => {
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const handleSignatureChange = useCallback(async (isEmpty: boolean) => {
    setSignatureEmpty(isEmpty);
    if (isEmpty) {
      setSignaturePngBytes(null);
      return;
    }
    // Pull the latest blob off the pad and stash as bytes so the PDF
    // useEffect can render it. SignaturePad fires onChange on the
    // empty/non-empty boundary — we re-grab via the ref to get current ink.
    try {
      const blob = await signatureRef.current?.toBlob();
      if (!blob) return;
      setSignaturePngBytes(await blobToUint8(blob));
    } catch (e) {
      console.warn('failed to capture signature bytes', e);
    }
  }, []);

  // Re-pull signature bytes on a periodic basis while drawing — onChange only
  // fires on empty<->non-empty transitions, but the user keeps adding ink.
  // This keeps the PDF preview's signature in sync with what's on the pad.
  // Polling at 500ms is fine; tighter intervals burn CPU on every rebuild.
  useEffect(() => {
    if (step !== 'review_and_sign') return;
    if (signatureEmpty) return;
    const id = setInterval(async () => {
      try {
        const blob = await signatureRef.current?.toBlob();
        if (!blob) return;
        const bytes = await blobToUint8(blob);
        setSignaturePngBytes((prev) => {
          if (prev && prev.length === bytes.length) {
            // Cheap byte-equality check before we trigger a rebuild.
            for (let i = 0; i < prev.length; i++) if (prev[i] !== bytes[i]) return bytes;
            return prev;
          }
          return bytes;
        });
      } catch {
        // Ignore — we'll catch up next tick.
      }
    }, 500);
    return () => clearInterval(id);
  }, [step, signatureEmpty]);

  const canAdoptAndSign = !signatureEmpty && !!signaturePngBytes && !submitting;

  const handleAdoptAndSign = async () => {
    if (!canAdoptAndSign) return;
    setError(null);
    setSubmitting(true);
    try {
      // Last-chance license upload if the snap step somehow didn't.
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
        if (upload.client_ip) setClientIp(upload.client_ip);
        if (upload.client_user_agent) setClientUserAgent(upload.client_user_agent);
      }

      // Upload the signature PNG.
      let signatureKey: string | null = null;
      if (signaturePngBytes) {
        const sigBlob = new Blob([new Uint8Array(signaturePngBytes)], { type: 'image/png' });
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

      // Build the FINAL signed PDF — same code path as the live preview, with
      // finalize:true to embed the audit metadata + visible "Signed" line.
      // The bytes the user was looking at and the bytes that get hashed are
      // produced identically; only the metadata changes.
      const finalBytes = await buildConsentPdfBytes(buildPdfData(true), { finalize: true });
      const pdfHashHex = await sha256Hex(finalBytes);
      const pdfBlob = new Blob([new Uint8Array(finalBytes)], { type: 'application/pdf' });

      const pdfUpload = await callConsentUploadUrl({
        artist_id: artistId,
        submission_id: submissionId,
        kind: 'pdf',
        content_type: 'application/pdf',
        content_length: pdfBlob.size,
      });
      await uploadToR2(pdfUpload.url, pdfUpload.headers, pdfBlob);
      const pdfKey = pdfUpload.key;

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
        pdf_sha256: pdfHashHex,
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
              onClick={() => setStep('disclosure')}
              className="w-full py-4 text-md bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong min-h-[52px]"
            >
              Get started
            </button>
          </div>
        )}

        {step === 'disclosure' && (
          <ConsentDisclosure
            agreed={disclosureAgreed}
            onAgreedChange={setDisclosureAgreed}
            onContinue={() => setStep('snap_id')}
            onBack={() => setStep('welcome')}
          />
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
                onClick={() => setStep('disclosure')}
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
          <form
            className="pt-4 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              if (fillFormReady && !submitting) setStep('review_and_sign');
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

            {error && <div className="text-base text-danger">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('snap_id')}
                className="flex-1 py-3.5 text-md text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!fillFormReady}
                className="flex-1 py-3.5 text-md bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'review_and_sign' && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="font-display text-2xl text-text-p mb-2">Review and sign</h2>
              <p className="text-base text-text-s">
                This is the form you're about to sign. Sign below — your signature will appear in the document. When you're done, tap Adopt and Sign.
              </p>
            </div>

            <div className="rounded-md border border-border/40 overflow-hidden">
              {pdfPreviewUrl ? (
                <PdfPreviewFrame src={pdfPreviewUrl} title="Consent form preview" />
              ) : (
                <div
                  className="w-full bg-white flex items-center justify-center text-text-t text-sm"
                  style={{ aspectRatio: '8.5 / 11' }}
                >
                  <Loader2 size={20} className="animate-spin mr-2" /> Building preview…
                </div>
              )}
            </div>

            <section>
              <h3 className="font-display text-lg text-text-p mb-2">Sign</h3>
              <p className="text-base text-text-t mb-3">
                Sign with your finger, or type your name to adopt a signature.
              </p>
              <SignaturePad
                ref={signatureRef}
                defaultName={`${licenseFields.first_name} ${licenseFields.last_name}`.trim()}
                onChange={handleSignatureChange}
              />
            </section>

            {error && <div className="text-base text-danger">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('fill_form')}
                disabled={submitting}
                className="flex-1 py-3.5 text-md text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all disabled:opacity-40 min-h-[48px]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleAdoptAndSign}
                disabled={!canAdoptAndSign}
                className="flex-1 py-3.5 text-md bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                {submitting ? 'Signing…' : 'Adopt and Sign'}
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
