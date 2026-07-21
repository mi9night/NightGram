const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(process.cwd(), "src/lib/notificationPreferences.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: sourcePath,
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.paths = module.paths;
loaded._compile(output, `${sourcePath}.cjs`);

const {
  isQuietHours,
  normalizeNotificationSettings,
  safeNotificationPreview,
  shouldPresentMessageNotification,
} = loaded.exports;

const at = (hour, minute = 0) => new Date(2026, 6, 21, hour, minute, 0);
const overnight = normalizeNotificationSettings({
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
});
const daytime = normalizeNotificationSettings({
  quietHoursEnabled: true,
  quietHoursStart: "13:00",
  quietHoursEnd: "15:00",
});

const checks = [
  [isQuietHours(overnight, at(23)), true, "overnight start"],
  [isQuietHours(overnight, at(7, 59)), true, "overnight before end"],
  [isQuietHours(overnight, at(12)), false, "overnight daytime"],
  [isQuietHours(daytime, at(14)), true, "daytime interval"],
  [isQuietHours(daytime, at(16)), false, "after daytime interval"],
  [isQuietHours({ quietHoursEnabled: true, quietHoursStart: "00:00", quietHoursEnd: "00:00" }, at(12)), true, "all-day quiet"],
  [shouldPresentMessageNotification({ settings: { ...overnight, quietHoursAllowMentions: true }, kind: "group", mentioned: true, focused: false, now: at(23) }), true, "priority mention"],
  [shouldPresentMessageNotification({ settings: { ...overnight, quietHoursAllowMentions: false }, kind: "group", mentioned: true, focused: false, now: at(23) }), false, "silenced mention"],
  [shouldPresentMessageNotification({ settings: { ...normalizeNotificationSettings(null), groupMessages: false }, kind: "group", focused: false, now: at(12) }), false, "group disabled"],
  [shouldPresentMessageNotification({ settings: { ...normalizeNotificationSettings(null), channelMessages: false }, kind: "channel", focused: false, now: at(12) }), false, "channel disabled"],
  [safeNotificationPreview({ ...normalizeNotificationSettings(null), showMessagePreview: false }, "secret"), "Новое уведомление NightGram", "private preview"],
];

for (const [actual, expected, name] of checks) {
  if (actual !== expected) throw new Error(`${name}: ${actual} !== ${expected}`);
}
console.log(`Notification preference logic: ${checks.length} checks passed.`);
