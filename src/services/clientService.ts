import { supabase } from '../lib/supabase';
import type { Client, ClientNote } from '../types';

/** Transform a Supabase row into a frontend Client object. */
function toClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    name: row.name as string,
    display_name: (row.display_name as string) ?? undefined,
    phone: (row.phone as string) ?? undefined,
    instagram: (row.instagram as string) ?? undefined,
    facebook_id: (row.facebook_id as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    dob: (row.dob as string) ?? undefined,
    channel: (row.channel as Client['channel']) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    notes: (row.notes as ClientNote[]) ?? [],
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
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: client.name,
      display_name: client.display_name ?? null,
      phone: client.phone ?? null,
      instagram: client.instagram ?? null,
      facebook_id: client.facebook_id ?? null,
      email: client.email ?? null,
      dob: client.dob ?? null,
      channel: client.channel ?? null,
      tags: client.tags ?? [],
      notes: [],
    })
    .select()
    .single();

  if (error) throw error;
  return toClient(data);
}

export async function updateClient(
  id: string,
  updates: Partial<Client>
): Promise<void> {
  // Strip frontend-only fields that don't exist in DB
  const { id: _id, created_at: _ca, ...dbUpdates } = updates as Record<string, unknown>;

  // Convert undefined to null for nullable DB columns
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dbUpdates)) {
    payload[key] = value === undefined ? null : value;
  }

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
    .update({ notes: notes as unknown as Record<string, unknown>[] })
    .eq('id', id);

  if (error) throw error;
}
