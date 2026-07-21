import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const checks = [
  ["src/lib/serverHealth.ts", ["/api/backend/health", "SERVER_HEALTH_EVENT", "CONNECTION_RECOVERY_EVENT", "7_500"]],
  ["src/components/shared/NetworkStatusBar.tsx", ["Сервер недоступен", "Повторить", "probeServerHealth", "requestConnectionRecovery"]],
  ["src/context/SocketProvider.tsx", ["CONNECTION_RECOVERY_EVENT", "forceReconnectSocket"]],
  ["src/app/api/backend/[...path]/route.ts", ["path === \"health\" ? 8_000 : 25_000"]],
  ["src/components/desktop/DesktopSettingsCard.tsx", ["Состояние сервера", "Проверить и переподключить"]],
];

for (const [file, required] of checks) {
  const source = read(file);
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(`[ERROR] ${file} does not contain required connection recovery marker: ${fragment}`);
      process.exit(1);
    }
  }
}

const packageJson = JSON.parse(read("package.json"));
const versionParts = String(packageJson.version || "0.0.0").split(".").map((part) => Number.parseInt(part, 10) || 0);
const minimumParts = [2, 10, 6];
const versionIsOld = versionParts.some((part, index) => part !== minimumParts[index]
  ? part < minimumParts[index]
  : false) && !(versionParts[0] > minimumParts[0] || (versionParts[0] === minimumParts[0] && versionParts[1] > minimumParts[1]));
if (versionIsOld) {
  console.error(`[ERROR] Connection recovery requires NightGram 2.10.6 or newer, got ${packageJson.version}`);
  process.exit(1);
}

console.log("Connection recovery configuration verified.");
