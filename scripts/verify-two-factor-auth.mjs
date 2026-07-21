import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["backend/src/lib/two-factor.js", ["generateTotpSecret", "verifyTotpCode", "encryptTotpSecret", "buildOtpAuthUrl", "consumeTotpCounter"]],
  ["backend/src/routes/auth.js", ["/2fa/verify-login", "/2fa/request", "/2fa/confirm", "two_factor_secret_encrypted"]],
  ["src/app/login/page.tsx", ["приложение-аутентификатор", "резервный код", "Подтвердить вход"]],
  ["src/app/(app)/settings/page.tsx", ["2FAS", "Aegis", "Google Authenticator", "Microsoft Authenticator", "otpauthUrl"]],
  ["src/lib/api.ts", ["verifyTwoFactorLogin", "requestTwoFactorAction", "confirmTwoFactorAction"]],
  ["supabase/migration_authenticator_two_factor.sql", ["two_factor_secret_encrypted", "consume_two_factor_counter", "pending_secret_encrypted"]],
];

for (const [file, needles] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file}`);
  const source = fs.readFileSync(full, "utf8");
  for (const needle of needles) if (!source.includes(needle)) throw new Error(`${file} does not contain ${needle}`);
}

const forbidden = ["RESEND_API_KEY", "AUTH_EMAIL_FROM", "AUTH_EMAIL_WEBHOOK_URL", "Код отправлен на"];
for (const file of ["backend/src/lib/two-factor.js", "src/app/login/page.tsx", "src/app/(app)/settings/page.tsx"]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const needle of forbidden) if (source.includes(needle)) throw new Error(`${file} still contains email 2FA marker ${needle}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const backendPkg = JSON.parse(fs.readFileSync(path.join(root, "backend/package.json"), "utf8"));
if (pkg.version !== backendPkg.version) throw new Error("Frontend/backend version mismatch");
if (pkg.dependencies?.qrcode !== "1.5.4") throw new Error("qrcode dependency is missing");
console.log("Authenticator TOTP configuration verified.");
