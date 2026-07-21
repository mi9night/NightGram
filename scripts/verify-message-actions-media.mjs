import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chat = read("src/components/messenger/ChatView.tsx");
const types = read("src/types/index.ts");
const socket = read("backend/src/socket.js");
const migration = read("supabase/migration_message_edit_delete_media.sql");

const requirements = [
  [chat.includes("activeMessageActionsId"), "explicit message actions state"],
  [chat.includes("scheduleMessageActionsClose"), "delayed desktop reaction close"],
  [chat.includes("isTouchInput && activeActionMessage"), "mobile reaction sheet"],
  [chat.includes('socket.emit("message:edit"'), "message edit client"],
  [chat.includes('socket.emit("message:delete"'), "message delete client"],
  [chat.includes("uploadMediaDetailed"), "detailed media upload"],
  [chat.includes("attachmentThumbnailUrl"), "message thumbnails"],
  [types.includes('"message:edited"'), "edited event types"],
  [types.includes('"message:deleted"'), "deleted event types"],
  [socket.includes('socket.on("message:edit"'), "message edit backend"],
  [socket.includes('socket.on("message:delete"'), "message delete backend"],
  [migration.includes("attachment_thumbnail_url"), "media metadata migration"],
];

const missing = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (missing.length) {
  console.error(`Missing NightGram 2.11 features: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("NightGram 2.11 message actions and media configuration verified.");
