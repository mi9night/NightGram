// =============================================================================
//  NightGram Web — Media upload helper
//  Uploads files through the backend as base64 (reliable, no multer issues).
// =============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Convert a File to base64 string.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a media file via the backend.
 * Returns a permanent public URL.
 */
export async function uploadMedia(
  file: File,
  folder: "avatars" | "posts" | "messages" = "posts",
): Promise<string> {
  // Convert file to base64
  const fileBase64 = await fileToBase64(file);

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
