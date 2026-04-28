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
  understands_risks: boolean;
  release_liability: boolean;
  questions_answered: boolean;
  aftercare_responsibility: boolean;
  no_alcohol_or_drugs: boolean;
  medical_conditions: boolean;
  not_responsible_spelling: boolean;
  color_variations_fade: boolean;
  understands_permanence: boolean;
  photography_release: boolean;
  no_refund_policy: boolean;
  age_18_plus: boolean;
}

export const emptyWaiverChecks: WaiverChecksValue = {
  understands_risks: false,
  release_liability: false,
  questions_answered: false,
  aftercare_responsibility: false,
  no_alcohol_or_drugs: false,
  medical_conditions: false,
  not_responsible_spelling: false,
  color_variations_fade: false,
  understands_permanence: false,
  photography_release: false,
  no_refund_policy: false,
  age_18_plus: false,
};

export interface WaiverItem {
  key: keyof WaiverChecksValue;
  label: string;
  required: boolean;
}

// All items are required. ESIGN consent (right to paper, right to withdraw)
// lives in the wizard's dedicated `disclosure` step, NOT here — see
// ConsentDisclosure.tsx.
//
// The studio name is intentionally hardcoded into the statement text rather
// than templated. v1 of this app is built specifically for Green Man Tattoo,
// and the consent statements ARE Green Man Tattoo's — copying them onto
// another studio's form with a substituted name would be wrong both legally
// (the statements were drafted for them) and stylistically. When the app
// adds per-studio configurable templates, those templates will carry their
// own statement text with the studio's name baked in the same way.
export const WAIVER_ITEMS: WaiverItem[] = [
  {
    key: 'understands_risks',
    required: true,
    label: 'I have been fully informed and understand that the risks associated with getting a tattoo include but are not limited to: infection, scarring, difficulties in the detection of melanoma, and allergic reactions to tattoo pigment, latex gloves, and/or soap. I freely accept all risks that may arise from the tattoo procedure.',
  },
  {
    key: 'release_liability',
    required: true,
    label: 'I agree to release, discharge, and forever hold harmless the tattoo artist, Green Man Tattoo, and all employees from any and all claims, damages, or legal actions connected in any way with my tattoo.',
  },
  {
    key: 'questions_answered',
    required: true,
    label: 'Green Man Tattoo has given me the opportunity to ask any questions about the procedure and application of my tattoo, and all of my questions, if any, have been answered to my satisfaction.',
  },
  {
    key: 'aftercare_responsibility',
    required: true,
    label: 'I have been given instructions on the care of my tattoo while it is healing. I acknowledge that it is possible the tattoo can become infected if I do not follow the instructions given to me. Any needed touch-ups due to my negligence will be at my own expense.',
  },
  {
    key: 'no_alcohol_or_drugs',
    required: true,
    label: 'I am not under the influence of alcohol or drugs, and I am voluntarily submitting to be tattooed by Green Man Tattoo without duress or coercion.',
  },
  {
    key: 'medical_conditions',
    required: true,
    label: 'I do not suffer from diabetes, epilepsy, hemophilia, heart conditions, nor do I take blood thinning medication. I am not pregnant or nursing, and I do not have a medical condition that may impair healing.',
  },
  {
    key: 'not_responsible_spelling',
    required: true,
    label: 'Green Man Tattoo is not responsible for the meaning or spelling of any design, text, or symbols chosen by me.',
  },
  {
    key: 'color_variations_fade',
    required: true,
    label: 'Variations in color and design may exist between my chosen design and the final tattoo. I understand that colors and clarity may fade over time due to unprotected exposure to the sun and the natural dispersion of pigment under the skin.',
  },
  {
    key: 'understands_permanence',
    required: true,
    label: 'I understand that a tattoo is a permanent change to my appearance and can only be removed by laser or surgical means, which may be costly and may not restore my skin to its exact appearance before the tattoo.',
  },
  {
    key: 'photography_release',
    required: true,
    label: 'I release Green Man Tattoo to use any photographs taken of me and my tattoo in print or electronic form.',
  },
  {
    key: 'no_refund_policy',
    required: true,
    label: 'I agree that Green Man Tattoo has a NO REFUND policy on tattoos.',
  },
  {
    key: 'age_18_plus',
    required: true,
    label: 'I hereby declare that I am 18+ (and have provided valid proof of age and identification).',
  },
];

export const REQUIRED_WAIVER_KEYS = WAIVER_ITEMS.filter((i) => i.required).map((i) => i.key);
