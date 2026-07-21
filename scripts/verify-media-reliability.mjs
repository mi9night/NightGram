import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const upload = read("src/lib/upload.ts");
const media = read("src/lib/mediaProcessing.ts");
const chat = read("src/components/messenger/ChatView.tsx");
const backend = read("backend/src/routes/upload.js");
const sw = read("public/sw.js");
const manifest = JSON.parse(read("public/manifest.json"));

const checks = [
  [upload.includes("XMLHttpRequest"), "binary upload transport"],
  [upload.includes("waiting-network") && upload.includes("maxRetries"), "network retry state"],
  [upload.includes("AbortSignal") && upload.includes("AbortError"), "upload cancellation"],
  [media.includes("preserveOriginal"), "original image mode"],
  [chat.includes("uploadProgress") && chat.includes("cancelActiveUpload"), "chat progress UI"],
  [chat.includes("Оригиналы") && chat.includes("Сжимать фото"), "original-quality toggle"],
  [backend.includes("/binary") && backend.includes("express.raw"), "binary backend route"],
  [backend.includes("fileSignatureMatches") && backend.includes("signature_mismatch"), "file signature validation"],
  [backend.includes("upsert: true") && backend.includes("x-upload-id"), "idempotent retry path"],
  [sw.includes("nightgram-static-v3.4.0"), "mobile PWA service worker"],
  [manifest.display === "standalone" && manifest.icons?.length >= 2, "installable PWA manifest"],
];

const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (missing.length) {
  console.error(`Missing NightGram 2.24 media features: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("NightGram 2.24 reliable media and mobile PWA configuration verified.");
