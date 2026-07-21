import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [
  ["backend/src/routes/search.js", [
    'router.get("/global"',
    "visibleConversationContext",
    'from("messages")',
    'from("conversation_participants")',
    "conversationParticipants",
  ]],
  ["backend/src/server.js", ["require('./routes/search')", JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version]],
  ["src/app/(app)/search/page.tsx", [
    "Глобальный поиск",
    "api.globalSearch",
    'localStorage.setItem("ng_open_message"',
    "Файлы и медиа",
    "Недавние запросы",
  ]],
  ["src/app/(app)/messages/page.tsx", ["ng_open_message", "initialMessageId"]],
  ["src/components/messenger/ChatView.tsx", ["initialMessageId", "getMessageContext"]],
  ["src/lib/api.ts", ["globalSearch", "/search/global"]],
  ["src/types/index.ts", ["GlobalSearchResponse", "GlobalSearchMessage"]],
];

for (const [relative, needles] of checks) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing ${relative}`);
  const source = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${relative} is missing: ${needle}`);
  }
}

for (const relative of ["backend/src/routes/search.js", "backend/src/server.js"]) {
  const result = spawnSync(process.execPath, ["--check", relative], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${relative} syntax check failed`);
}

console.log("Global search configuration verified.");
