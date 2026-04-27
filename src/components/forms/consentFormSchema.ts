// Shared types + constants for the consent form. Split out of the section
// components so React Fast Refresh can work cleanly (it needs a file to
// either be all components or all values, not a mix).
//
// When configurable per-artist templates land later, this is where the
// schema-as-data definition will live.

export interface LicenseFieldsValue {
  first_name: string;
  last_name: string;
  dob: string;
}

export const emptyLicenseFields: LicenseFieldsValue = {
  first_name: '',
  last_name: '',
  dob: '',
};

/** Free-text fields describing the tattoo being consented to. Client-entered
 *  during the wizard so they can be baked into the signed PDF. */
export interface TattooDetailsValue {
  location: string;
  description: string;
}

export const emptyTattooDetails: TattooDetailsValue = {
  location: '',
  description: '',
};

export interface WaiverChecksValue {
  age_18_plus: boolean;
  no_alcohol_24h: boolean;
  not_pregnant: boolean;
  no_blood_thinners: boolean;
  understands_permanence: boolean;
  understands_risks: boolean;
  release_liability: boolean;
  photography_release: boolean;
}

export const emptyWaiverChecks: WaiverChecksValue = {
  age_18_plus: false,
  no_alcohol_24h: false,
  not_pregnant: false,
  no_blood_thinners: false,
  understands_permanence: false,
  understands_risks: false,
  release_liability: false,
  photography_release: false,
};

export interface WaiverItem {
  key: keyof WaiverChecksValue;
  label: string;
  required: boolean;
}

// ESIGN consent (right to paper copy + right to withdraw + scope) lives in
// the wizard's dedicated `disclosure` step now, not in this list — collecting
// it BEFORE any other data is what ESIGN §7001(c) calls for.
export const WAIVER_ITEMS: WaiverItem[] = [
  { key: 'age_18_plus', required: true, label: 'I am 18 years of age or older.' },
  { key: 'no_alcohol_24h', required: true, label: 'I have not consumed alcohol or non-prescribed drugs in the past 24 hours.' },
  { key: 'not_pregnant', required: true, label: 'I am not pregnant or breastfeeding.' },
  { key: 'no_blood_thinners', required: true, label: 'I am not on blood thinners or anticoagulant medication, and I have disclosed any relevant medical history.' },
  { key: 'understands_permanence', required: true, label: 'I understand that a tattoo is a permanent modification to my body.' },
  { key: 'understands_risks', required: true, label: 'I have been informed of the risks (allergic reaction, infection, scarring, etc.) and accept them.' },
  { key: 'release_liability', required: true, label: 'I release the artist and studio from liability for results and procedure-related complications, except in the case of negligence.' },
  { key: 'photography_release', required: false, label: 'I consent to photographs of the finished tattoo being used for portfolio and social media (optional).' },
];

export const REQUIRED_WAIVER_KEYS = WAIVER_ITEMS.filter((i) => i.required).map((i) => i.key);
