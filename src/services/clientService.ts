import { supabase } from '../lib/supabase';
import type { Client, ClientNote } from '../types';
import type { Database, Json } from '../types/database';

type ClientRow = Database['public']['Tables']['clients']['Row'];
type ClientInsert = Database['public']['Tables']['clients']['Insert'];
type ClientUpdate = Database['public']['Tables']['clients']['Update'];

/** Transform a Supabase row into a frontend Client object. */
function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    created_at: row.created_at,
    name: row.name,
    display_name: row.display_name ?? undefined,
    phone: row.phone ?? undefined,
    instagram: row.instagram ?? undefined,
    facebook_id: row.facebook_id ?? undefined,
    email: row.email ?? undefined,
    dob: row.dob ?? undefined,
    channel: row.channel ?? undefined,
    tags: row.tags ?? [],
    notes: (row.notes as unknown as ClientNote[]) ?? [],
  };
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toClient);
}

export async function createClient(
  client: Omit<Client, 'id' | 'created_at' | 'notes'>
): Promise<Client> {
  const row: ClientInsert = {
    name: client.name,
    display_name: client.display_name ?? null,
    phone: client.phone ?? null,
    instagram: client.instagram ?? null,
    facebook_id: client.facebook_id ?? null,
    email: client.email ?? null,
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
  if (updates.facebook_id !== undefined) payload.facebook_id = updates.facebook_id ?? null;
  if (updates.email !== undefined) payload.email = updates.email ?? null;
  if (updates.dob !== undefined) payload.dob = updates.dob ?? null;
  if (updates.channel !== undefined) payload.channel = updates.channel ?? null;
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.notes !== undefined) payload.notes = updates.notes as unknown as Json;

  const { error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
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
