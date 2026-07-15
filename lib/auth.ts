import { createSupabaseBrowserClient } from "./supabase-browser";

export async function getCurrentUser() {
  const supabase = createSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOut() {
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
}
