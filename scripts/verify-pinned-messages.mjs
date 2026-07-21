import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chat = read("src/components/messenger/ChatView.tsx");
const api = read("src/lib/api.ts");
const types = read("src/types/index.ts");
const routes = read("backend/src/routes/conversations.js");
const socket = read("backend/src/socket.js");
const migration = read("supabase/migration_message_pins.sql");

const requirements = [
  [chat.includes("pinnedMessages"), "pinned messages state"],
  [chat.includes("Закреплённые сообщения"), "pinned messages panel"],
  [chat.includes("togglePinnedMessage"), "pin/unpin client action"],
  [chat.includes("jumpToPinnedMessage"), "context jump client"],
  [chat.includes('socket.on("message:pinned"'), "realtime pin synchronization"],
  [api.includes("getPinnedMessages"), "pinned messages API"],
  [api.includes("getMessageContext"), "message context API"],
  [types.includes('"message:pinned"'), "socket event typing"],
  [routes.includes('router.get("/:id/pinned-messages"'), "pinned messages backend route"],
  [routes.includes('router.post("/:id/messages/:messageId/pin"'), "pin toggle backend route"],
  [routes.includes('router.get("/:id/messages/:messageId/context"'), "message context backend route"],
  [chat.includes("setPinnedMessages((current) => current.filter"), "deleted message pin cleanup"],
  [migration.includes("idx_messages_pinned"), "message pins migration"],
];

const missing = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (missing.length) {
  console.error(`Missing NightGram 2.12 pinned message features: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("NightGram 2.12 pinned messages configuration verified.");
