// Upload routes — authenticated JSON fallback plus binary streaming uploads.
// Binary uploads power real progress, cancellation and safe retries on web,
// Windows/Electron and installable mobile PWA clients.
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(['avatars', 'posts', 'messages']);
const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/ogg', 'ogg'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['application/pdf', 'pdf'],
  ['text/plain', 'txt'],
  ['application/zip', 'zip'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
]);

function normalizedMime(value) {
  return String(value || '').toLowerCase().split(';')[0].trim();
}

function sanitizeUploadId(value) {
  const safe = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return safe || crypto.randomUUID();
}

function fileSignatureMatches(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const ascii = (start, end) => buffer.subarray(start, end).toString('ascii');
  const hex = (start, end) => buffer.subarray(start, end).toString('hex');

  switch (mimeType) {
    case 'image/jpeg': return hex(0, 3) === 'ffd8ff';
    case 'image/png': return hex(0, 8) === '89504e470d0a1a0a';
    case 'image/gif': return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'image/avif':
    case 'image/heic':
    case 'image/heif': {
      const brand = ascii(8, 12);
      const allowed = mimeType === 'image/avif'
        ? ['avif', 'avis', 'mif1', 'msf1']
        : ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];
      return ascii(4, 8) === 'ftyp' && allowed.includes(brand);
    }
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4':
    case 'audio/x-m4a': return ascii(4, 8) === 'ftyp';
    case 'video/webm':
    case 'audio/webm': return hex(0, 4) === '1a45dfa3';
    case 'audio/ogg': return ascii(0, 4) === 'OggS';
    case 'audio/wav': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    case 'audio/mpeg': return ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case 'application/pdf': return ascii(0, 5) === '%PDF-';
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return ['504b0304', '504b0506', '504b0708'].includes(hex(0, 4));
    case 'text/plain': {
      const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
      return !sample.includes(0);
    }
    default: return false;
  }
}

function decodeDataUrl(value, declaredMime) {
  const input = String(value || '');
  const match = input.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) return null;
  const encodedMime = normalizedMime(match[1]);
  const mimeType = normalizedMime(declaredMime || encodedMime);
  if (encodedMime !== mimeType || !MIME_EXTENSIONS.has(mimeType)) return null;
  const compact = match[2].replace(/\s+/g, '');
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) return null;
  const buffer = Buffer.from(compact, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES || !fileSignatureMatches(buffer, mimeType)) return null;
  return { buffer, mimeType, extension: MIME_EXTENSIONS.get(mimeType) };
}

async function saveUpload({ buffer, mimeType, extension, folder, userId, uploadId }) {
  const bucket = 'nightgram-media';
  const targetFolder = ALLOWED_FOLDERS.has(folder) ? folder : 'posts';
  const objectId = sanitizeUploadId(uploadId);
  const path = `${targetFolder}/${userId}/${objectId}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: mimeType,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw error;

  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) {
    const unavailable = new Error('storage_unavailable');
    unavailable.code = 'storage_unavailable';
    throw unavailable;
  }
  return {
    url: `${base}/storage/v1/object/public/${bucket}/${path}`,
    path,
    size: buffer.length,
    mimeType,
    uploadId: objectId,
  };
}

router.post(
  '/binary',
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  async (req, res) => {
    try {
      const mimeType = normalizedMime(req.headers['content-type']);
      const extension = MIME_EXTENSIONS.get(mimeType);
      const buffer = req.body;
      if (!extension || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_FILE_BYTES) {
        return res.status(400).json({ error: 'invalid_file', message: 'Файл повреждён, не поддерживается или превышает 50 МБ' });
      }
      if (!fileSignatureMatches(buffer, mimeType)) {
        return res.status(400).json({ error: 'signature_mismatch', message: 'Содержимое файла не соответствует заявленному формату' });
      }

      const result = await saveUpload({
        buffer,
        mimeType,
        extension,
        folder: req.headers['x-upload-folder'],
        userId: req.userId,
        uploadId: req.headers['x-upload-id'],
      });
      return res.status(201).json(result);
    } catch (error) {
      console.error(`[Upload binary ${req.requestId}]`, error.stack || error.message);
      if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'file_too_large', message: 'Максимальный размер файла — 50 МБ' });
      }
      return res.status(error?.code === 'storage_unavailable' ? 503 : 500).json({ error: 'upload_failed', message: 'Не удалось загрузить файл' });
    }
  },
);

router.post('/', async (req, res) => {
  try {
    const { fileBase64, mimeType, folder, uploadId } = req.body || {};
    const decoded = decodeDataUrl(fileBase64, mimeType);
    if (!decoded) {
      return res.status(400).json({
        error: 'invalid_file',
        message: 'Файл повреждён, имеет неподдерживаемый формат или превышает 50 МБ',
      });
    }

    const result = await saveUpload({
      ...decoded,
      folder,
      userId: req.userId,
      uploadId,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error(`[Upload ${req.requestId}]`, error.stack || error.message);
    res.status(error?.code === 'storage_unavailable' ? 503 : 500).json({ error: 'upload_failed', message: 'Не удалось загрузить файл' });
  }
});

module.exports = router;
