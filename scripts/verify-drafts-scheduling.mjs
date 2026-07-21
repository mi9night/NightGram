import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const checks = [
  ["src/lib/chatDrafts.ts", ["saveChatDraft", "getChatDraft", "subscribeToChatDrafts"]],
  ["src/components/messenger/ChatList.tsx", ["Черновик:", "getAllChatDrafts"]],
  ["src/components/messenger/ChatView.tsx", ["scheduleComposerMessage", "Отложенная отправка", "scheduled:sent", "retryScheduled"]],
  ["src/lib/api.ts", ["getScheduledMessages", "scheduleMessage", "cancelScheduledMessage", "retryScheduledMessage"]],
  ["backend/src/routes/conversations.js", ["/:id/scheduled", "migration_scheduled_messages.sql", "scheduled/:scheduledId/retry"]],
  ["backend/src/lib/scheduledMessages.js", ["claimScheduledMessage", "processDueScheduledMessages", "selfScheduled: true"]],
  ["backend/src/server.js", ["startScheduledMessages"]],
  ["supabase/migration_scheduled_messages.sql", ["create table if not exists public.scheduled_messages", "idx_scheduled_messages_due"]],
];

for (const [file, needles] of checks) {
  const content = read(file);
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file}: missing ${needle}`);
  }
}

const packageJson = JSON.parse(read("package.json"));
const backendPackage = JSON.parse(read("backend/package.json"));
if (packageJson.version !== backendPackage.version) {
  throw new Error(`Frontend/backend versions must match: ${packageJson.version} !== ${backendPackage.version}`);
}
if (!read("backend/src/server.js").includes(packageJson.version)) {
  throw new Error(`backend/src/server.js must expose current version ${packageJson.version}`);
}

console.log("Drafts and scheduled messages configuration verified ✓");
