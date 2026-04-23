import { supabase } from '../lib/supabase';
import type { Client, ClientNote, LinkedProfile } from '../types';
import type { Database, Json } from '../types/database';
import { resolveAvatarUrls, invalidateAvatarUrlCache } from './messageService';
import { compressAvatar } from '../utils/imageProcessing';

const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;

type ClientRow = Database['public']['Tables']['clients']['Row'];
type ClientInsert = Database['public']['Tables']['clients']['Insert'];
type ClientUpdate = Database['public']['Tables']['clients']['Update'];

/** Transform a Supabase row into a frontend Client object. Note: profile_pic
 *  here is still the RAW column value (path or data URL). Callers that need
 *  to render it should either resolve via resolveAvatarUrls, or rely on the
 *  linkedProfiles fallback in ClientCard / BookingDrawer (which IS resolved).
 *  Today the clients.profile_pic column is never written, so this is
 *  effectively always null. */
function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    created_at: row.created_at,
    name: row.name,
    display_name: row.display_name ?? undefined,
    phone: row.phone ?? undefined,
    instagram: row.instagram ?? undefined,
    facebook: row.facebook ?? undefined,
    dob: row.dob ?? undefined,
    channel: row.channel ?? undefined,
    tags: row.tags ?? [],
    notes: (row.notes as unknown as ClientNote[]) ?? [],
    profile_pic: row.profile_pic ?? undefined,
  };
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const clients = (data ?? []).map(toClient);

  // If any client has a populated profile_pic (future feature once the
  // column starts being written — empty today), resolve paths → signed
  // URLs. Legacy data URLs pass through unchanged. This is a no-op when
  // no clients have a profile_pic set.
  const withPic = clients.filter((c) => c.profile_pic);
  if (withPic.length === 0) return clients;

  // clients.profile_pic has no backend flag today (column unused).
  // Defaults to 'supabase' via resolveAvatarUrls' fallback path.
  const urlMap = await resolveAvatarUrls(
    withPic.map((c) => ({ id: c.id, pic: c.profile_pic }))
  );
  return clients.map((c) =>
    c.profile_pic ? { ...c, profile_pic: urlMap.get(c.id) ?? undefined } : c
  );
}

/** Fetch participant profiles for all linked PSIDs so we can display handles/names.
 *  profilePic is returned as a renderable URL (signed, or legacy data URL). */
export async function fetchLinkedProfiles(psids: string[]): Promise<Record<string, LinkedProfile>> {
  if (psids.length === 0) return {};
  const { data } = await supabase
    .from('participant_profiles')
    .select('psid, name, platform, profile_pic, profile_pic_backend')
    .in('psid', psids);

  const rows = data ?? [];
  const urlMap = await resolveAvatarUrls(
    rows.map((p) => ({
      id: p.psid,
      pic: p.profile_pic,
      backend: p.profile_pic_backend,
    }))
  );

  const map: Record<string, LinkedProfile> = {};
  for (const p of rows) {
    map[p.psid] = {
      psid: p.psid,
      name: p.name ?? 'Unknown',
      platform: p.platform as 'instagram' | 'messenger',
      profilePic: urlMap.get(p.psid) ?? undefined,
    };
  }
  return map;
}

/** Fetch all participant profiles for a platform (for the link picker in client form).
 *  profilePic is returned as a renderable URL (signed, or legacy data URL). */
export async function fetchAvailableProfiles(platform: 'instagram' | 'messenger'): Promise<LinkedProfile[]> {
  const { data } = await supabase
    .from('participant_profiles')
    .select('psid, name, platform, profile_pic, profile_pic_backend')
    .eq('platform', platform)
    .order('name');

  const rows = data ?? [];
  const urlMap = await resolveAvatarUrls(
    rows.map((p) => ({
      id: p.psid,
      pic: p.profile_pic,
      backend: p.profile_pic_backend,
    }))
  );

  return rows.map((p) => ({
    psid: p.psid,
    name: p.name ?? 'Unknown',
    platform: p.platform as 'instagram' | 'messenger',
    profilePic: urlMap.get(p.psid) ?? undefined,
  }));
}

export async function createClient(
  client: Omit<Client, 'id' | 'created_at' | 'notes'>
): Promise<Client> {
  const row: ClientInsert = {
    name: client.name,
    display_name: client.display_name ?? null,
    phone: client.phone ?? null,
    instagram: client.instagram ?? null,
    facebook: client.facebook ?? null,
    dob: client.dob ?? null,
    channel: client.channel ?? null,
    tags: client.tags ?? [],
    notes: [] as Json,
  };

  const { data, error } = await supabase
    .from('clients')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return toClient(data);
}

export async function updateClient(
  id: string,
  updates: Partial<Client>
): Promise<void> {
  const payload: ClientUpdate = {};

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.display_name !== undefined) payload.display_name = updates.display_name ?? null;
  if (updates.phone !== undefined) payload.phone = updates.phone ?? null;
  if (updates.instagram !== undefined) payload.instagram = updates.instagram ?? null;
  if (updates.facebook !== undefined) payload.facebook = updates.facebook ?? null;
  if (updates.dob !== undefined) payload.dob = updates.dob ?? null;
  if (updates.channel !== undefined) payload.channel = updates.channel ?? null;
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.notes !== undefined) payload.notes = updates.notes as unknown as Json;
  if (updates.profile_pic !== undefined) payload.profile_pic = updates.profile_pic ?? null;

  const { error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

/** Upload a custom avatar for a client. Resizes to 512px JPEG (≤256KB bucket
 *  cap), writes to `{user_id}/clients/{client_id}.jpg`, and returns both the
 *  storage path (persist to clients.profile_pic) and a signed URL for
 *  immediate display. The storage RLS policy enforces path-scoping via
 *  (storage.foldername(name))[1] = auth.uid(), so uploads outside the
 *  caller's folder fail. Uploads use upsert so repeat uploads overwrite. */
export async function uploadClientAvatar(
  clientId: string,
  file: File,
): Promise<{ path: string; signedUrl: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { blob } = await compressAvatar(file);
  const path = `${user.id}/clients/${clientId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  // Previous signed URL (if any) is now stale — drop it so the next resolve
  // mints a fresh one pointing at the new blob.
  invalidateAvatarUrlCache(path);

  const { data: signed, error: signError } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) throw signError ?? new Error('Failed to sign avatar URL');

  return { path, signedUrl: signed.signedUrl };
}

/** Remove a client's custom avatar from storage. Safe to call even if no
 *  object exists at the path — `remove` is idempotent and returns an empty
 *  array in that case. Caller is responsible for clearing clients.profile_pic. */
export async function deleteClientAvatar(clientId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const path = `${user.id}/clients/${clientId}.jpg`;
  const { error } = await supabase.storage.from('avatars').remove([path]);
  if (error) throw error;

  invalidateAvatarUrlCache(path);
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateClientNotes(
  id: string,
  notes: ClientNote[]
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ notes: notes as unknown as Json })
    .eq('id', id);

  if (error) throw error;
}
