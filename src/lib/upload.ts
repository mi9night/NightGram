// =============================================================================
//  NightGram Web — lazy media upload facade
//  Keeps the heavy Supabase client out of initial page bundles until a user
//  actually chooses a file to upload.
// =============================================================================

export type UploadFolder = "avatars" | "posts" | "messages";

export async function uploadMedia(file: File, folder: UploadFolder = "posts"): Promise<string> {
  const mod = await import("@/lib/supabase");
  return mod.uploadMedia(file, folder);
}
