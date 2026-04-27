// Renders a submitted consent form in review mode. Used by:
//   - the artist's ConsentFormDrawer (modal viewer)
//   - the public client wizard's final "review/submit" step
// Both call sites see the exact same layout — that's the whole point.
//
// This component owns R2 → blob URL resolution so callers don't have to.
// The client wizard's review step doesn't go through R2 (the license + sig
// blobs are still local), so it bypasses this and renders sections directly.

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  LicenseImageSection,
  LicenseFieldsSection,
  WaiverChecksSection,
  SignatureSection,
} from './ConsentFormSections';
import {
  type LicenseFieldsValue,
  type WaiverChecksValue,
  emptyLicenseFields,
  emptyWaiverChecks,
} from './consentFormSchema';
import { useR2Image } from '../../hooks/useR2Image';
import type { ConsentSubmission } from '../../types';

interface Props {
  submission: ConsentSubmission;
}

function deriveLicenseFields(s: ConsentSubmission): LicenseFieldsValue {
  return {
    first_name: s.license_first_name ?? '',
    last_name: s.license_last_name ?? '',
    dob: s.license_dob ?? '',
  };
}

function deriveWaiverChecks(s: ConsentSubmission): WaiverChecksValue {
  const fd = (s.form_data ?? {}) as Partial<Record<keyof WaiverChecksValue, unknown>>;
  return {
    ...emptyWaiverChecks,
    ...Object.fromEntries(
      (Object.keys(emptyWaiverChecks) as Array<keyof WaiverChecksValue>).map((k) => [
        k,
        fd[k] === true,
      ]),
    ),
  } as WaiverChecksValue;
}

export default function ConsentForm({ submission }: Props) {
  const licenseUrl = useR2Image(submission.license_image_key);
  const signatureUrl = useR2Image(submission.signature_image_key);

  // Once the form is past initial review (approve has happened), the artist
  // doesn't need the ID image staring back at them every time they open the
  // drawer — it's PII they already verified. Default it to hidden behind a
  // Show toggle for approved_pending / finalized; submitted always shows it
  // because that's the moment the artist needs to verify the ID against the
  // client's stated name + DOB.
  const licenseHiddenByDefault = submission.status !== 'submitted';
  const [licenseShown, setLicenseShown] = useState(!licenseHiddenByDefault);

  const licenseFields = submission.license_first_name || submission.license_last_name || submission.license_dob
    ? deriveLicenseFields(submission)
    : emptyLicenseFields;

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

      <LicenseFieldsSection mode="review" value={licenseFields} />
      <WaiverChecksSection mode="review" value={deriveWaiverChecks(submission)} />
      <SignatureSection
        mode="review"
        signatureUrl={signatureUrl}
        hasSignature={Boolean(submission.signature_image_key)}
        signedAt={submission.submitted_at}
      />
    </div>
  );
}
