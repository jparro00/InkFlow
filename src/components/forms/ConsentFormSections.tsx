// Section components for the consent form. Each section supports two modes:
//   fill   — interactive inputs (used in the public client wizard)
//   review — read-only display of the same data (used by the artist's
//            review drawer AND by the wizard's final step before submit)
//
// Keeping fill + review in one component is the whole point: the form's
// labels, ordering, and wording live in exactly one place. When the artist
// sees a submitted form, they're seeing the same component the client just
// filled out — minus the editability.

import { Check, X, Loader2, Sparkles } from 'lucide-react';
import CameraCapture from './CameraCapture';
import SignaturePad, { type SignaturePadHandle } from './SignaturePad';
import {
  WAIVER_ITEMS,
  type LicenseFieldsValue,
  type WaiverChecksValue,
} from './consentFormSchema';

const inputClass =
  'w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-base text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]';

const sectionTitleClass = 'font-display text-md text-text-p mb-2';
const sectionHintClass = 'text-sm text-text-t mb-3';

// =============================================================================
// LicenseImageSection
// =============================================================================

interface LicenseImageSectionFillProps {
  mode: 'fill';
  imagePreviewUrl: string | null;
  onPickFile: (file: File) => void;
  analyzing?: boolean;
  ocrSucceeded?: boolean;
}

interface LicenseImageSectionReviewProps {
  mode: 'review';
  /** Already-resolved URL (R2 blob URL for artist, local blob URL for client review). Null while loading, undefined when no image at all. */
  imageUrl: string | null | undefined;
  /** True when we know there's an image but the URL hasn't loaded yet (lets us render a skeleton vs an empty state). */
  hasImage?: boolean;
}

type LicenseImageSectionProps =
  | LicenseImageSectionFillProps
  | LicenseImageSectionReviewProps;

export function LicenseImageSection(props: LicenseImageSectionProps) {
  if (props.mode === 'review') {
    return (
      <section>
        <h2 className={sectionTitleClass}>ID / License</h2>
        {props.imageUrl ? (
          <div className="rounded-md overflow-hidden border border-border/40 bg-bg/40">
            <img src={props.imageUrl} alt="License" className="w-full block" />
          </div>
        ) : props.hasImage ? (
          <div className="rounded-md border border-border/40 bg-bg/40 aspect-[1.586] flex items-center justify-center text-sm text-text-t">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="rounded-md border border-border/40 border-dashed bg-bg/40 p-6 text-center text-sm text-text-t">
            No license image.
          </div>
        )}
      </section>
    );
  }

  // Fill mode — in-page camera. CameraCapture handles the streaming preview,
  // shutter button, retake, and gallery fallback for desktop / denied perms.
  return (
    <section>
      <h2 className={sectionTitleClass}>ID / License</h2>
      <p className={sectionHintClass}>
        Snap a clear photo of your driver's license or government-issued photo ID.
      </p>

      <CameraCapture
        previewUrl={props.imagePreviewUrl}
        onCapture={props.onPickFile}
      />

      {props.analyzing && (
        <div className="mt-3 bg-surface/60 rounded-lg border border-border/30 p-3 flex items-center gap-2">
          <Loader2 size={16} className="text-accent animate-spin shrink-0" />
          <div className="text-sm text-text-s">Reading your ID…</div>
        </div>
      )}
      {!props.analyzing && props.ocrSucceeded && (
        <div className="mt-3 bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-2">
          <Sparkles size={14} className="text-success shrink-0" />
          <div className="text-sm text-text-s">Your name and date of birth were read from the ID.</div>
        </div>
      )}
    </section>
  );
}

// =============================================================================
// LicenseFieldsSection — name + dob only
// =============================================================================

interface LicenseFieldsSectionProps {
  mode: 'fill' | 'review';
  value: LicenseFieldsValue;
  onChange?: (next: LicenseFieldsValue) => void;
}

export function LicenseFieldsSection({ mode, value, onChange }: LicenseFieldsSectionProps) {
  if (mode === 'review') {
    const fullName = [value.first_name, value.last_name].filter(Boolean).join(' ').trim();
    return (
      <section>
        <h2 className={sectionTitleClass}>Your details</h2>
        <dl className="space-y-3">
          <ReviewRow label="Name" value={fullName} />
          <ReviewRow label="Date of birth" value={value.dob} />
        </dl>
      </section>
    );
  }

  const set = (patch: Partial<LicenseFieldsValue>) => onChange?.({ ...value, ...patch });

  return (
    <section>
      <h2 className={sectionTitleClass}>Your details</h2>
      <p className={sectionHintClass}>Confirm your name and date of birth.</p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-text-s mb-1.5 block">First name</label>
            <input
              type="text"
              value={value.first_name}
              onChange={(e) => set({ first_name: e.target.value })}
              className={inputClass}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className="text-sm text-text-s mb-1.5 block">Last name</label>
            <input
              type="text"
              value={value.last_name}
              onChange={(e) => set({ last_name: e.target.value })}
              className={inputClass}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-text-s mb-1.5 block">Date of birth</label>
          <input
            type="date"
            value={value.dob}
            onChange={(e) => set({ dob: e.target.value })}
            className={`${inputClass} [color-scheme:dark]`}
            autoComplete="bday"
          />
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// WaiverChecksSection
// =============================================================================

interface WaiverChecksSectionProps {
  mode: 'fill' | 'review';
  value: WaiverChecksValue;
  onChange?: (next: WaiverChecksValue) => void;
}

export function WaiverChecksSection({ mode, value, onChange }: WaiverChecksSectionProps) {
  return (
    <section>
      <h2 className={sectionTitleClass}>Consent</h2>
      {mode === 'fill' && (
        <p className={sectionHintClass}>Read each statement and confirm.</p>
      )}
      <ul className="space-y-3">
        {WAIVER_ITEMS.map((item) => {
          const checked = value[item.key] === true;
          if (mode === 'review') {
            return (
              <li key={item.key} className="flex items-start gap-3">
                {checked ? (
                  <span className="w-5 h-5 mt-0.5 rounded-md bg-success/20 border border-success/40 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-success" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="w-5 h-5 mt-0.5 rounded-md bg-bg/60 border border-border/60 flex items-center justify-center shrink-0">
                    {!item.required && <X size={12} className="text-text-t" strokeWidth={2} />}
                  </span>
                )}
                <span className={`text-sm leading-relaxed ${checked ? 'text-text-s' : 'text-text-t'}`}>
                  {item.label}
                </span>
              </li>
            );
          }
          return (
            <li key={item.key}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onChange?.({ ...value, [item.key]: e.target.checked })}
                  className="mt-1 w-5 h-5 accent-accent shrink-0 cursor-pointer"
                />
                <span className="text-sm text-text-s leading-relaxed">{item.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// =============================================================================
// SignatureSection
// =============================================================================

interface SignatureSectionFillProps {
  mode: 'fill';
  signatureRef: React.Ref<SignaturePadHandle>;
  defaultName?: string;
  onChange?: (isEmpty: boolean) => void;
}

interface SignatureSectionReviewProps {
  mode: 'review';
  signatureUrl: string | null | undefined;
  hasSignature?: boolean;
}

type SignatureSectionProps = SignatureSectionFillProps | SignatureSectionReviewProps;

export function SignatureSection(props: SignatureSectionProps) {
  if (props.mode === 'review') {
    const { signatureUrl, hasSignature } = props;
    return (
      <section>
        <h2 className={sectionTitleClass}>Signature</h2>
        {signatureUrl ? (
          <div className="rounded-md border border-border/40 bg-bg/40 aspect-[3/1] flex items-center justify-center overflow-hidden">
            <img src={signatureUrl} alt="Signature" className="max-h-full max-w-full" />
          </div>
        ) : hasSignature ? (
          <div className="rounded-md border border-border/40 bg-bg/40 aspect-[3/1] flex items-center justify-center text-sm text-text-t">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="rounded-md border border-border/40 border-dashed bg-bg/40 p-6 text-center text-sm text-text-t">
            No signature.
          </div>
        )}
      </section>
    );
  }

  const { signatureRef, defaultName, onChange } = props;
  return (
    <section>
      <h2 className={sectionTitleClass}>Signature</h2>
      <p className={sectionHintClass}>Sign with your finger, or type your name to adopt a signature.</p>
      <SignaturePad ref={signatureRef} defaultName={defaultName} onChange={onChange} />
    </section>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function ReviewRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-t uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className="text-base text-text-p">
        {value || <span className="text-text-t italic">—</span>}
      </dd>
    </div>
  );
}
