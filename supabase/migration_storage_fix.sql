-- =============================================================================
--  NightGram — Storage policies fix (CRITICAL for image uploads)
--  Run this in Supabase SQL Editor.
--  This allows direct browser uploads to the nightgram-media bucket.
-- =============================================================================

-- 1. Add policies to storage.objects for nightgram-media bucket

-- Allow public read
CREATE POLICY "nightgram-media-public-read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'nightgram-media');

-- Allow anyone (even anon) to upload
CREATE POLICY "nightgram-media-public-upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'nightgram-media');

-- Allow updates (for upsert)
CREATE POLICY "nightgram-media-public-update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'nightgram-media');

-- Allow deletes
CREATE POLICY "nightgram-media-public-delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'nightgram-media');

-- 2. Ensure the bucket is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('nightgram-media', 'nightgram-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Verify
SELECT id, name, public FROM storage.buckets WHERE id = 'nightgram-media';
