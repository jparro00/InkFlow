import { supabase } from '../lib/supabase';

export async function saveApiKey(apiKey: string): Promise<void> {
  const { error } = await supabase.functions.invoke('save-api-key', {
    body: { apiKey },
  });
  if (error) throw error;

  // Clean up legacy localStorage key if present
  localStorage.removeItem('inkbloop-anthropic-key');
}

export async function removeApiKey(): Promise<void> {
  const { error } = await supabase.functions.invoke('save-api-key', {
    body: { remove: true },
  });
  if (error) throw error;

  localStorage.removeItem('inkbloop-anthropic-key');
}

export async function hasApiKey(): Promise<boolean> {
  // Check legacy localStorage first (migration path)
  if (localStorage.getItem('inkbloop-anthropic-key')) return true;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('user_settings')
    .select('has_api_key')
    .eq('user_id', user.id)
    .single();

  return data?.has_api_key ?? false;
}
