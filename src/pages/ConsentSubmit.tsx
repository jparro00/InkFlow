import { useState, useRef, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Camera, RotateCcw, Check, FileSignature, Loader2, Sparkles } from 'lucide-react';
import SignaturePad, { type SignaturePadHandle } from '../components/forms/SignaturePad';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Step = 'welcome' | 'license' | 'info' | 'waiver' | 'review' | 'done';

interface LicenseFields {
  first_name: string;
  last_name: string;
  dob: string;
  number: string;
  state: string;
  expiry: string;
  address: string;
}

interface FormData extends Record<string, unknown> {
  email: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  health_conditions: string;
  age_18_plus: boolean;
  no_alcohol_24h: boolean;
  not_pregnant: boolean;
  no_blood_thinners: boolean;
  understands_permanence: boolean;
  understands_risks: boolean;
  release_liability: boolean;
  photography_release: boolean;
}

const emptyLicense: LicenseFields = {
  first_name: '',
  last_name: '',
  dob: '',
  number: '',
  state: '',
  expiry: '',
  address: '',
};

const emptyForm: FormData = {
  email: '',
  phone: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  health_conditions: '',
  age_18_plus: false,
  no_alcohol_24h: false,
  not_pregnant: false,
  no_blood_thinners: false,
  understands_permanence: false,
  understands_risks: false,
  release_liability: false,
  photography_release: false,
};

const REQUIRED_CHECKS: Array<{ key: keyof FormData; label: string }> = [
  { key: 'age_18_plus', label: 'I am 18 years of age or older.' },
  { key: 'no_alcohol_24h', label: 'I have not consumed alcohol or non-prescribed drugs in the past 24 hours.' },
  { key: 'not_pregnant', label: 'I am not pregnant or breastfeeding.' },
  { key: 'no_blood_thinners', label: 'I am not on blood thinners or anticoagulant medication, and I have disclosed any relevant medical history.' },
  { key: 'understands_permanence', label: 'I understand that a tattoo is a permanent modification to my body.' },
  { key: 'understands_risks', label: 'I have been informed of the risks (allergic reaction, infection, scarring, etc.) and accept them.' },
  { key: 'release_liability', label: 'I release the artist and studio from liability for results and procedure-related complications, except in the case of negligence.' },
];

const OPTIONAL_CHECKS: Array<{ key: keyof FormData; label: string }> = [
  { key: 'photography_release', label: 'I consent to photographs of the finished tattoo being used for portfolio and social media (optional).' },
];

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
      // Supabase Edge gateway requires apikey on every call, even with --no-verify-jwt.
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
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`R2 upload failed: ${res.status}`);
  }
}

async function callConsentAnalyzeId(params: {
  artist_id: string;
  submission_id: string;
  license_key: string;
}): Promise<{ fields: Partial<LicenseFields>; raw: unknown } | null> {
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
      // Soft-fail: OCR is best-effort. Returning null lets the user fall
      // through to manual entry without an error message.
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
  license: {
    image_key: string | null;
    first_name: string;
    last_name: string;
    dob: string;
    number: string;
    state: string;
    expiry: string;
    address: string;
  };
  form_data: FormData;
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

  // Generate a stable submission_id for the lifetime of this page.
  const submissionId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState<Step>('welcome');
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licenseDataUrl, setLicenseDataUrl] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [licenseRaw, setLicenseRaw] = useState<unknown>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrSucceeded, setOcrSucceeded] = useState(false);
  const [licenseFields, setLicenseFields] = useState<LicenseFields>(emptyLicense);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!artistId || !isUuid(artistId)) {
    return <Navigate to="/login" replace />;
  }

  const inputClass =
    'w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLicenseFile(file);
    setLicenseKey(null);
    setLicenseRaw(null);
    setOcrSucceeded(false);
    const reader = new FileReader();
    reader.onload = () => setLicenseDataUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  /**
   * Upload the license to R2 and run Textract. Done in the background as soon
   * as the user taps Next on the license step, so the Info step can land with
   * fields already pre-filled.
   */
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
        setLicenseFields({
          first_name: f.first_name ?? '',
          last_name: f.last_name ?? '',
          dob: f.dob ?? '',
          number: f.number ?? '',
          state: (f.state ?? '').toUpperCase().slice(0, 2),
          expiry: f.expiry ?? '',
          address: f.address ?? '',
        });
        setLicenseRaw(analyzed.raw);
        setOcrSucceeded(true);
      }
    } catch (e) {
      console.error(e);
      // Don't block the user — they can still type the fields by hand.
      setError(e instanceof Error ? e.message : 'License upload failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const allRequiredChecked = REQUIRED_CHECKS.every((c) => formData[c.key] === true);
  const personalInfoFilled =
    licenseFields.first_name.trim() &&
    licenseFields.last_name.trim() &&
    licenseFields.dob &&
    formData.email.trim() &&
    formData.phone.trim();

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // 1. License: already uploaded in uploadAndAnalyzeLicense() during the
      // license → info transition. If that failed for any reason (offline,
      // analyzer error), upload it now as a last-chance fallback so the form
      // still has an image attached.
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

      // 2. Signature
      let signatureKey: string | null = null;
      const sigBlob = await signatureRef.current?.toBlob();
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

      // 3. Submit row
      await callConsentSubmit({
        artist_id: artistId,
        submission_id: submissionId,
        license: { image_key: licenseKeyToSubmit, ...licenseFields },
        form_data: formData,
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
      {/* Header */}
      <header className="px-5 pt-8 pb-4 flex items-center gap-3 max-w-2xl w-full mx-auto">
        <FileSignature size={22} className="text-accent" />
        <h1 className="font-display text-xl text-text-p">Consent form</h1>
      </header>

      <div className="flex-1 px-5 pb-12 max-w-2xl w-full mx-auto">
        {step === 'welcome' && (
          <div className="pt-12 text-center">
            <h2 className="font-display text-2xl text-text-p mb-3">Before your tattoo</h2>
            <p className="text-base text-text-s leading-relaxed mb-8">
              We need to collect a photo of your government ID, confirm a few details, and have you sign a standard waiver. It takes about 3 minutes.
            </p>
            <button
              onClick={() => setStep('license')}
              className="w-full py-4 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong min-h-[52px]"
            >
              Get started
            </button>
          </div>
        )}

        {step === 'license' && (
          <div className="pt-4">
            <h2 className="font-display text-xl text-text-p mb-2">ID / License</h2>
            <p className="text-sm text-text-t mb-5">
              Snap a photo of your driver's license or government-issued photo ID. Make sure the text is in focus and the whole card is visible.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {licenseDataUrl ? (
              <div className="rounded-md overflow-hidden border border-border/60 mb-3">
                <img src={licenseDataUrl} alt="License preview" className="w-full block" />
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-[1.586] rounded-md border-2 border-dashed border-border/60 bg-surface/40 flex flex-col items-center justify-center gap-2 text-text-t cursor-pointer press-scale transition-all active:bg-surface/80"
              >
                <Camera size={28} strokeWidth={1.5} />
                <span className="text-sm">Tap to take a photo</span>
              </button>
            )}

            {licenseDataUrl && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mb-3 py-3 text-sm text-text-s rounded-md border border-border/60 cursor-pointer press-scale transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                Retake
              </button>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep('welcome')}
                className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                Back
              </button>
              <button
                onClick={() => {
                  setStep('info');
                  // Kick off the upload + Textract analysis in the background
                  // so the Info step lands with fields already filled in.
                  if (!licenseKey) uploadAndAnalyzeLicense();
                }}
                disabled={!licenseFile}
                className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'info' && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="font-display text-xl text-text-p mb-2">Your details</h2>
              <p className="text-sm text-text-t">Confirm the details from your ID and how to reach you.</p>
            </div>

            {analyzing && (
              <div className="bg-surface/60 rounded-lg border border-border/30 p-4 flex items-center gap-3">
                <Loader2 size={18} className="text-accent animate-spin shrink-0" />
                <div className="text-sm text-text-s">Reading your ID…</div>
              </div>
            )}
            {!analyzing && ocrSucceeded && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-3">
                <Sparkles size={16} className="text-success shrink-0" />
                <div className="text-sm text-text-s">
                  We pulled these from your ID — please double-check.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-text-s mb-1.5 block">First name</label>
                <input
                  type="text"
                  value={licenseFields.first_name}
                  onChange={(e) => setLicenseFields({ ...licenseFields, first_name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm text-text-s mb-1.5 block">Last name</label>
                <input
                  type="text"
                  value={licenseFields.last_name}
                  onChange={(e) => setLicenseFields({ ...licenseFields, last_name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm text-text-s mb-1.5 block">Date of birth</label>
                <input
                  type="date"
                  value={licenseFields.dob}
                  onChange={(e) => setLicenseFields({ ...licenseFields, dob: e.target.value })}
                  className={`${inputClass} [color-scheme:dark]`}
                />
              </div>
              <div>
                <label className="text-sm text-text-s mb-1.5 block">License #</label>
                <input
                  type="text"
                  value={licenseFields.number}
                  onChange={(e) => setLicenseFields({ ...licenseFields, number: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm text-text-s mb-1.5 block">State</label>
                <input
                  type="text"
                  value={licenseFields.state}
                  onChange={(e) => setLicenseFields({ ...licenseFields, state: e.target.value.toUpperCase().slice(0, 2) })}
                  placeholder="WA"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm text-text-s mb-1.5 block">Expires</label>
                <input
                  type="date"
                  value={licenseFields.expiry}
                  onChange={(e) => setLicenseFields({ ...licenseFields, expiry: e.target.value })}
                  className={`${inputClass} [color-scheme:dark]`}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-text-s mb-1.5 block">Address</label>
              <input
                type="text"
                value={licenseFields.address}
                onChange={(e) => setLicenseFields({ ...licenseFields, address: e.target.value })}
                placeholder="Street, City, State, ZIP"
                className={inputClass}
              />
            </div>

            <div className="border-t border-border/30 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-text-s mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm text-text-s mb-1.5 block">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep('license')}
                className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                Back
              </button>
              <button
                onClick={() => setStep('waiver')}
                disabled={!personalInfoFilled}
                className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'waiver' && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="font-display text-xl text-text-p mb-2">Consent &amp; signature</h2>
              <p className="text-sm text-text-t">Please read and confirm each statement, then sign below.</p>
            </div>

            <div className="space-y-3">
              {REQUIRED_CHECKS.map((c) => (
                <label key={c.key} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData[c.key] === true}
                    onChange={(e) => setFormData({ ...formData, [c.key]: e.target.checked })}
                    className="mt-1 w-5 h-5 accent-accent shrink-0 cursor-pointer"
                  />
                  <span className="text-sm text-text-s leading-relaxed">{c.label}</span>
                </label>
              ))}
              <div className="border-t border-border/30 my-3" />
              {OPTIONAL_CHECKS.map((c) => (
                <label key={c.key} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData[c.key] === true}
                    onChange={(e) => setFormData({ ...formData, [c.key]: e.target.checked })}
                    className="mt-1 w-5 h-5 accent-accent shrink-0 cursor-pointer"
                  />
                  <span className="text-sm text-text-s leading-relaxed">{c.label}</span>
                </label>
              ))}
            </div>

            <div className="border-t border-border/30 pt-5 space-y-3">
              <div>
                <label className="text-sm text-text-s mb-1.5 block">
                  Health conditions, allergies, or medications we should know about
                </label>
                <textarea
                  value={formData.health_conditions}
                  onChange={(e) => setFormData({ ...formData, health_conditions: e.target.value })}
                  placeholder="None, or list anything relevant..."
                  className={`${inputClass} h-20 resize-none`}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-text-s mb-1.5 block">Emergency contact name</label>
                  <input
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm text-text-s mb-1.5 block">Emergency contact phone</label>
                  <input
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/30 pt-5">
              <label className="text-sm text-text-s mb-2 block">Signature</label>
              <SignaturePad
                ref={signatureRef}
                defaultName={`${licenseFields.first_name} ${licenseFields.last_name}`.trim()}
                onChange={(empty) => setSignatureEmpty(empty)}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep('info')}
                className="flex-1 py-3.5 text-base text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
              >
                Back
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={!allRequiredChecked || signatureEmpty}
                className="flex-1 py-3.5 text-base bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="pt-4 space-y-5">
            <div>
              <h2 className="font-display text-xl text-text-p mb-2">Review and submit</h2>
              <p className="text-sm text-text-t">Confirm everything looks right.</p>
            </div>

            <div className="bg-surface/60 rounded-lg border border-border/30 p-4 space-y-2">
              <div className="text-xs text-text-t uppercase tracking-wider">Name</div>
              <div className="text-base text-text-p">
                {licenseFields.first_name} {licenseFields.last_name}
              </div>
              <div className="text-sm text-text-t mt-3">DOB {licenseFields.dob}</div>
            </div>

            <div className="bg-surface/60 rounded-lg border border-border/30 p-4">
              <div className="text-xs text-text-t uppercase tracking-wider mb-2">Contact</div>
              <div className="text-sm text-text-s">{formData.email}</div>
              <div className="text-sm text-text-s">{formData.phone}</div>
            </div>

            {error && (
              <div className="text-sm text-danger">{error}</div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep('waiver')}
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
