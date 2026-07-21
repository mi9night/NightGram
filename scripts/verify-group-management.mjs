import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["backend/src/routes/conversations.js", [
    'router.patch("/:id/group"',
    'router.post("/:id/members"',
    'router.patch("/:id/members/:userId"',
    'router.delete("/:id/members/:userId"',
    'router.post("/:id/transfer-owner"',
    'router.post("/:id/leave"',
    'conversation:changed',
  ]],
  ["src/components/messenger/ChatInfo.tsx", [
    "updateGroupConversation",
    "addGroupMembers",
    "updateGroupMemberRole",
    "transferGroupOwnership",
    "removeGroupMember",
    "leaveGroupConversation",
  ]],
  ["src/app/(app)/messages/page.tsx", ["conversation:changed", "lg:hidden"]],
  ["src/lib/api.ts", ["updateGroupConversation", "addGroupMembers", "transferGroupOwnership"]],
  ["supabase/migration_group_management.sql", ["description", "idx_conversation_participants_conversation_role"]],
];

for (const [relative, needles] of checks) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing ${relative}`);
  const source = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${relative} is missing: ${needle}`);
  }
}

console.log("Group management configuration verified.");
