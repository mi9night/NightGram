// Upload routes — handles file uploads via base64 (no multer needed)
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// POST /api/upload — upload a file as base64 JSON
router.post("/", async (req, res) => {
  try {
    const { fileBase64, fileName, mimeType, folder } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: "Файл не предоставлен" });
    }

    const targetFolder = folder || "posts";
    const bucket = "nightgram-media";

    // Parse extension from fileName or mimeType
    let ext = "jpg";
    if (fileName) {
      const parts = fileName.split(".");
      if (parts.length > 1) ext = parts.pop();
    } else if (mimeType) {
      const map = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4" };
      ext = map[mimeType] || "bin";
    }
    ext = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "bin";

    const path = `${targetFolder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Convert base64 to buffer
    const buffer = Buffer.from(fileBase64.split(";base64,").pop(), "base64");

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: mimeType || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("[Upload] Error:", error.message);
      return res.status(500).json({ error: `Ошибка загрузки: ${error.message}` });
    }

    // Build public URL
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

    res.json({ url: publicUrl, path });
  } catch (err) {
    console.error("[Upload] Exception:", err.message);
    res.status(500).json({ error: `Внутренняя ошибка: ${err.message}` });
  }
});

module.exports = router;
