import fs from "node:fs";
const required = [
  ["backend/src/lib/privacy.js", ["canViewProfile", "canMessage", "canAddToGroups", "canViewLastSeen"]],
  ["supabase/migration_privacy_safety.sql", ["privacy_profile", "privacy_messages", "privacy_groups", "privacy_last_seen"]],
  ["src/app/(app)/settings/page.tsx", ["PrivacySection", "Чёрный список", "Запросы от незнакомых"]],
  ["backend/src/routes/social.js", ["privacy:block-updated", "friendships"]],
  ["src/components/messenger/ChatView.tsx", ["reportMessage", "message_report"]],
];
for (const [file, needles] of required) { const text = fs.readFileSync(file, "utf8"); for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file}: missing ${needle}`); }
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const backendPkg = JSON.parse(fs.readFileSync("backend/package.json", "utf8"));
if (pkg.version !== backendPkg.version) throw new Error("Frontend/backend version mismatch");
console.log("Privacy and personal safety configuration verified.");
