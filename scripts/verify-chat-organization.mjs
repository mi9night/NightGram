import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["src/components/messenger/ChatList.tsx", ["archived", '"work"', '"friends"', '"family"', "onToggleArchive", "onSetFolder"]],
  ["src/components/messenger/ChatInfo.tsx", ["toggleConversationArchive", "setConversationFolder", "Организация чата"]],
  ["src/lib/api.ts", ["toggleConversationArchive", "setConversationFolder"]],
  ["backend/src/routes/conversations.js", ['router.post("/:id/archive"', 'router.post("/:id/folder"', "CHAT_ORGANIZATION_FOLDERS"]],
  ["supabase/migration_chat_organization.sql", ["archived boolean", "folder text", "idx_conversation_participants_user_archived"]],
];

for (const [file, needles] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(full, "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${file} does not contain ${needle}`);
  }
}
console.log("Chat organization configuration verified.");
