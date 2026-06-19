// =============================================================================
//  NightGram Web — Media upload helper
//  Uploads files through the backend (which uses the service-role key,
//  bypassing Storage RLS restrictions).
// =============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Upload a media file via the backend.
 * Returns a permanent public URL.
 */
export async function uploadMedia(
  file: File,
  folder: "avatars" | "posts" | "messages" = "posts",
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const token = typeof window !== "undefined" ? localStorage.getItem("ng_access_token") : null;

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ошибка загрузки (${res.status})`);
  }

  const data = await res.json();
  return data.url as string;
}
