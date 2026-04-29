// Section components for the consent form. Each section supports two modes:
//   fill   — interactive inputs (used in the public client wizard)
//   review — read-only display of the same data (used by the artist's
//            review drawer AND by the wizard's final step before submit)
//
// Keeping fill + review in one component is the whole point: the form's
// labels, ordering, and wording live in exactly one place. When the artist
// sees a submitted form, they're seeing the same component the client just
// filled out — minus the editability.

import { Check, X, Loader2 } from 'lucide-react';
import CameraCapture from './CameraCapture';
import {
  WAIVER_ITEMS,
  type LicenseFieldsValue,
  type TattooDetailsValue,
  type WaiverChecksValue,
} from './consentFormSchema';

// Inputs use text-md (17px) so iOS Safari doesn't auto-zoom on focus —
// anything under 16px triggers it. The rest of the readability scale is
// keyed off this: titles → text-lg, body/legal → text-md, labels/hints
// → text-base, captions → text-sm.
const inputClass =
  'w-full bg-input border border-border/60 rounded-md px-4 py-3.5 text-md text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px]';

const sectionTitleClass = 'font-display text-lg text-text-p mb-2';
const sectionHintClass = 'text-base text-text-t mb-3';

// =============================================================================
// LicenseImageSection
// =============================================================================

interface LicenseImageSectionFillProps {
  mode: 'fill';
  imagePreviewUrl: string | null;
  onPickFile: (file: File) => void;
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
  /** When true (fill mode only), DOB renders as a read-only display so the
   *  client can't edit around the verified-from-ID age check. Name stays
   *  editable for typo correction. */
  dobLocked?: boolean;
}

export function LicenseFieldsSection({ mode, value, onChange, dobLocked }: LicenseFieldsSectionProps) {
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
            <label className="text-base text-text-s mb-1.5 block">First name</label>
            <input
              type="text"
              value={value.first_name}
              onChange={(e) => set({ first_name: e.target.value })}
              className={inputClass}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className="text-base text-text-s mb-1.5 block">Last name</label>
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
          <label className="text-base text-text-s mb-1.5 block">Date of birth</label>
          {dobLocked ? (
            <div className={`${inputClass} flex items-center justify-between cursor-not-allowed opacity-80`}>
              <span>{value.dob || '—'}</span>
              <span className="text-xs text-text-t uppercase tracking-wider">Verified</span>
            </div>
          ) : (
            <input
              type="date"
              value={value.dob}
              onChange={(e) => set({ dob: e.target.value })}
              className={`${inputClass} [color-scheme:dark]`}
              autoComplete="bday"
            />
          )}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// TattooDetailsSection — location + description, client-entered
// =============================================================================
//
// These fields land on the signed PDF (and on the consent_submissions row),
// so the client confirms exactly what they're consenting to. There's no
// review-mode counterpart in the artist drawer because the artist sees this
// on the PDF preview rather than as separate fields.

interface TattooDetailsSectionProps {
  value: TattooDetailsValue;
  onChange: (next: TattooDetailsValue) => void;
}

export function TattooDetailsSection({ value, onChange }: TattooDetailsSectionProps) {
  const set = (patch: Partial<TattooDetailsValue>) => onChange({ ...value, ...patch });
  return (
    <section>
      <h2 className={sectionTitleClass}>Tattoo</h2>
      <p className={sectionHintClass}>What and where is the tattoo? This goes on the signed form.</p>
      <div className="space-y-3">
        <div>
          <label className="text-base text-text-s mb-1.5 block">Location on body</label>
          <textarea
            value={value.location}
            onChange={(e) => set({ location: e.target.value.slice(0, 200) })}
            placeholder="e.g. Right forearm"
            className={`${inputClass} h-20 resize-none`}
          />
        </div>
        <div>
          <label className="text-base text-text-s mb-1.5 block">Description</label>
          <textarea
            value={value.description}
            onChange={(e) => set({ description: e.target.value.slice(0, 1000) })}
            placeholder="Brief description of the design…"
            className={`${inputClass} h-28 resize-none`}
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
      <ul className="space-y-4">
        {WAIVER_ITEMS.map((item) => {
          const checked = value[item.key] === true;
          if (mode === 'review') {
            return (
              <li key={item.key} className="flex items-center gap-3">
                {/* Statement copy uses text-base — same scale as the body
                    of the "Before you sign" disclosure, since these are
                    paragraph-style legal statements not headlines. */}
                <span className={`text-base leading-relaxed flex-1 ${checked ? 'text-text-s' : 'text-text-t'}`}>
                  {item.label}
                </span>
                {checked ? (
                  <span className="w-10 h-10 rounded-md bg-success/20 border border-success/40 flex items-center justify-center shrink-0">
                    <Check size={20} className="text-success" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="w-10 h-10 rounded-md bg-bg/60 border border-border/60 flex items-center justify-center shrink-0">
                    {!item.required && <X size={18} className="text-text-t" strokeWidth={2} />}
                  </span>
                )}
              </li>
            );
          }
          return (
            <li key={item.key}>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-base text-text-s leading-relaxed flex-1">{item.label}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onChange?.({ ...value, [item.key]: e.target.checked })}
                  className="w-10 h-10 accent-accent shrink-0 cursor-pointer"
                />
              </label>
            </li>
          );
        })}
      </ul>
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
