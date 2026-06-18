// =============================================================================
//  NightGram Web — Supabase client (Postgres / Storage helpers)
//  The backend holds the service-role key; the browser uses anon + RLS.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

/** Browser Supabase client (anon key, RLS-protected). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/**
 * Upload a media file (avatar / post image / message attachment) to the
 * Supabase Storage bucket `nightgram-media`. Falls back to object URL when
 * Supabase is not configured (dev mock).
 */
export async function uploadMedia(
  file: File,
  folder: "avatars" | "posts" | "messages" = "posts",
): Promise<string> {
  if (!SUPABASE_URL) return URL.createObjectURL(file);

  const sb = getSupabase();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await sb.storage
    .from("nightgram-media")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;

  const { data } = sb.storage.from("nightgram-media").getPublicUrl(path);
  return data.publicUrl;
}
