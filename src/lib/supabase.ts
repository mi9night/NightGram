// =============================================================================
//  NightGram Web — Media upload helper
//  Direct upload to Supabase Storage from browser (fast, no base64 overhead).
//  Requires Storage bucket "nightgram-media" with public read + write policies.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/**
 * Upload a media file directly to Supabase Storage.
 * Returns a permanent public URL.
 * Falls back to backend upload if direct fails.
 */
export async function uploadMedia(
  file: File,
  folder: "avatars" | "posts" | "messages" = "posts",
): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase не настроен");
  }

  const sb = getClient();
  const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Try direct upload to Storage
  const { data, error } = await sb.storage
    .from("nightgram-media")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (error) {
    // If direct upload fails (RLS), try backend
    return uploadViaBackend(file, folder);
  }

  // Get public URL
  const { data: urlData } = sb.storage.from("nightgram-media").getPublicUrl(path);
  return urlData.publicUrl;
}

/**
 * Fallback: upload via backend as base64 (slower but works if Storage RLS blocks).
 */
async function uploadViaBackend(file: File, folder: string): Promise<string> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

  // Convert to base64
  const fileBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const token = typeof window !== "undefined" ? localStorage.getItem("ng_access_token") : null;

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      fileBase64,
      fileName: file.name,
      mimeType: file.type,
      folder,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ошибка загрузки (${res.status})`);
  }

  const data = await res.json();
  return data.url as string;
}
