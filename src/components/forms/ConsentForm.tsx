// Renders a submitted consent form in review mode. Used by:
//   - the artist's ConsentFormDrawer (modal viewer)
//   - the public client wizard's final "review/submit" step
// Both call sites see the exact same layout — that's the whole point.
//
// This component owns R2 → blob URL resolution so callers don't have to.
// The client wizard's review step doesn't go through R2 (the license + sig
// blobs are still local), so it bypasses this and renders sections directly.

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

  const licenseFields = submission.license_first_name || submission.license_last_name || submission.license_dob
    ? deriveLicenseFields(submission)
    : emptyLicenseFields;

  return (
    <div className="space-y-6">
      <LicenseImageSection
        mode="review"
        imageUrl={licenseUrl}
        hasImage={Boolean(submission.license_image_key)}
      />
      <LicenseFieldsSection mode="review" value={licenseFields} />
      <WaiverChecksSection mode="review" value={deriveWaiverChecks(submission)} />
      <SignatureSection
        mode="review"
        signatureUrl={signatureUrl}
        hasSignature={Boolean(submission.signature_image_key)}
      />
    </div>
  );
}
