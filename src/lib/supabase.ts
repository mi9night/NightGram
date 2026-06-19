// =============================================================================
//  NightGram Web — Supabase client (Postgres / Storage helpers)
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
 * Upload a media file to Supabase Storage bucket "nightgram-media".
 * Returns a PERMANENT public URL.
 */
export async function uploadMedia(
  file: File,
  folder: "avatars" | "posts" | "messages" = "posts",
): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase не настроен. Загрузка файлов недоступна.");
  }

  const sb = getSupabase();
  const ext = file.name.split(".").pop() ?? "bin";
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

  // Upload the file
  const { data: uploadData, error: uploadError } = await sb.storage
    .from("nightgram-media")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    throw new Error(`Ошибка загрузки: ${uploadError.message}`);
  }

  // Build the public URL manually for reliability
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/nightgram-media/${path}`;

  return publicUrl;
}
