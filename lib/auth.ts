import { createSupabaseBrowserClient } from "./supabase-browser";
import { viderCache } from "./cache-client";

export async function getCurrentUser() {
  const supabase = createSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOut() {
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
  // Données lues par le compte (cache client) : jamais visibles par le compte suivant.
  viderCache();
}
