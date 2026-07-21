import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["backend/src/lib/security-events.js", ["logSecurityEvent", "auth_security_events", "requestMeta"]],
  ["backend/src/routes/auth.js", ["/2fa/recovery/request", "/2fa/recovery/complete", "/2fa/recovery/cancel", "/security-events", "/export", "TRUSTED_SESSION_MIN_AGE_MS"]],
  ["src/app/(app)/settings/page.tsx", ["Журнал безопасности", "Запросить восстановление", "Резервные коды заканчиваются", "Экспорт личных данных"]],
  ["src/lib/api.ts", ["requestTwoFactorRecovery", "completeTwoFactorRecovery", "getSecurityEvents", "exportAccountData"]],
  ["supabase/migration_account_recovery_security_log.sql", ["auth_security_events", "two_factor_recovery_requests", "idx_two_factor_recovery_one_active"]],
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
if (pkg.version !== backendPkg.version || pkg.version !== lock.version) throw new Error("Project/backend version mismatch");
console.log("Account recovery and security journal configuration verified.");
