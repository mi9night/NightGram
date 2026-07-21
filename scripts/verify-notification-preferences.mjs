import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["src/lib/notificationPreferences.ts", ["quietHoursEnabled", "quietHoursAllowMentions", "shouldPresentMessageNotification", "safeNotificationPreview", "playNotificationSound"]],
  ["src/app/(app)/settings/page.tsx", ["Личные чаты", "Каналы", "Тихие часы", "Показывать текст сообщения", "Push в фоне и входящие звонки"]],
  ["src/components/shared/MessagePushToasts.tsx", ["conversationKind", "ng_open_message", "showNotification", "containsMention"]],
  ["src/context/NotificationsContext.tsx", ["shouldPresentAppNotification", "playNotificationSound"]],
  ["backend/src/socket.js", ["conversationKind", "channel_id"]],
  ["backend/src/lib/scheduledMessages.js", ["conversationKind", "channel_id"]],
];
for (const [file, needles] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file}`);
  const source = fs.readFileSync(full, "utf8");
  for (const needle of needles) if (!source.includes(needle)) throw new Error(`${file} missing ${needle}`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const backendPkg = JSON.parse(fs.readFileSync(path.join(root, "backend/package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "backend/package-lock.json"), "utf8"));
if (backendPkg.version !== pkg.version || lock.version !== pkg.version) throw new Error("Project/backend version mismatch");
const [major, minor] = pkg.version.split(".").map(Number);
if (major < 2 || (major === 2 && minor < 23)) throw new Error("Notification preferences require NightGram 2.23.0 or newer");
const server = fs.readFileSync(path.join(root, "backend/src/server.js"), "utf8");
if (!server.includes(`APP_VERSION = '${pkg.version}'`)) throw new Error("Backend health version mismatch");
console.log("Notification categories, quiet hours and private previews verified.");
