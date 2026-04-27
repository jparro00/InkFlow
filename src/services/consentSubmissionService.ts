import { supabase } from '../lib/supabase';
import type { ConsentSubmission, ConsentSubmissionStatus } from '../types';
import type { Database } from '../types/database';

type Row = Database['public']['Tables']['consent_submissions']['Row'];
type Update = Database['public']['Tables']['consent_submissions']['Update'];

function toConsentSubmission(row: Row): ConsentSubmission {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    license_image_key: row.license_image_key ?? undefined,
    license_first_name: row.license_first_name ?? undefined,
    license_last_name: row.license_last_name ?? undefined,
    license_dob: row.license_dob ?? undefined,
    license_number: row.license_number ?? undefined,
    license_address: row.license_address ?? undefined,
    license_state: row.license_state ?? undefined,
    license_expiry: row.license_expiry ?? undefined,
    license_raw_data: row.license_raw_data ?? undefined,
    form_data: (row.form_data as Record<string, unknown>) ?? {},
    signature_image_key: row.signature_image_key ?? undefined,
    booking_id: row.booking_id ?? undefined,
    payment_type: row.payment_type ?? undefined,
    payment_amount: row.payment_amount ?? undefined,
    tattoo_location: row.tattoo_location ?? undefined,
    tattoo_description: row.tattoo_description ?? undefined,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at ?? undefined,
    finalized_at: row.finalized_at ?? undefined,
    created_at: row.created_at,
  };
}

export async function fetchConsentSubmissions(): Promise<ConsentSubmission[]> {
  const { data, error } = await supabase
    .from('consent_submissions')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toConsentSubmission);
}

export async function fetchConsentSubmission(id: string): Promise<ConsentSubmission | null> {
  const { data, error } = await supabase
    .from('consent_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? toConsentSubmission(data) : null;
}

export async function updateConsentSubmission(
  id: string,
  patch: Partial<Update>,
): Promise<ConsentSubmission> {
  const { data, error } = await supabase
    .from('consent_submissions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return toConsentSubmission(data);
}

export async function deleteConsentSubmission(id: string): Promise<void> {
  const { error } = await supabase
    .from('consent_submissions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Approve transitions submitted → approved_pending. The booking_id is
 * required for this transition (artist must pick the booking the form
 * applies to). Stamps approved_at.
 */
export async function approveConsentSubmission(
  id: string,
  bookingId: string,
): Promise<ConsentSubmission> {
  return updateConsentSubmission(id, {
    status: 'approved_pending',
    booking_id: bookingId,
    approved_at: new Date().toISOString(),
  });
}

/**
 * Finalize transitions approved_pending → finalized once the artist has
 * filled in payment + tattoo location + description. Stamps finalized_at.
 */
export async function finalizeConsentSubmission(
  id: string,
  fields: {
    payment_type: string;
    payment_amount: number;
    tattoo_location: string;
    tattoo_description: string;
  },
): Promise<ConsentSubmission> {
  return updateConsentSubmission(id, {
    ...fields,
    status: 'finalized',
    finalized_at: new Date().toISOString(),
  });
}

export type { ConsentSubmissionStatus };
