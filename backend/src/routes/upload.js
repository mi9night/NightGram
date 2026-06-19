// Upload routes — handles file uploads via backend (bypasses Storage RLS)
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const multer = require("multer");

// In-memory storage (we stream to Supabase)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// POST /api/upload — upload a file to Supabase Storage
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не предоставлен" });

  const folder = req.body.folder || "posts";
  const bucket = "nightgram-media";
  const ext = (req.file.originalname.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, req.file.buffer, {
      contentType: req.file.mimetype || "image/jpeg",
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
});

module.exports = router;
