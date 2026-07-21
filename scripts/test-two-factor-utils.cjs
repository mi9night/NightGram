const Module = require("node:module");
const crypto = require("node:crypto");
const path = require("node:path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "nightgram-test-jwt-secret-that-is-long-enough";
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith("/supabase") || request === "./supabase") return { supabase: {} };
  if (request.endsWith("/safety") || request === "./safety") return { clientIp: () => "127.0.0.1" };
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const lib = require(path.join(process.cwd(), "backend/src/lib/two-factor.js"));
  const generated = lib.createBackupCodes(8);
  if (generated.codes.length !== 8 || generated.hashes.length !== 8) throw new Error("Backup-code count is wrong");
  if (new Set(generated.codes).size !== 8) throw new Error("Backup codes are not unique");
  for (const code of generated.codes) if (!/^NG-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code)) throw new Error(`Invalid backup-code format: ${code}`);
  const first = generated.codes[0];
  if (lib.matchBackupCode(generated.hashes, first.toLowerCase().replace(/-/g, " ")) !== 0) throw new Error("Normalized backup code did not match");
  const digest = crypto.createHash("sha256").update(lib.normalizeBackupCode(first)).digest("hex");
  if (digest !== generated.hashes[0]) throw new Error("Backup-code hash mismatch");

  // RFC 6238 SHA-1 test secret at T=1, truncated to the six digits used by NightGram.
  const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const counter = lib.verifyTotpCode(rfcSecret, "287082", { now: 59000, window: 0 });
  if (counter !== 1) throw new Error(`TOTP verification failed: ${counter}`);
  if (lib.verifyTotpCode(rfcSecret, "287082", { now: 59000, window: 0, lastCounter: 1 }) !== null) throw new Error("Replayed TOTP code was accepted");

  const secret = lib.generateTotpSecret();
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error("Generated TOTP secret has an unexpected format");
  const encrypted = lib.encryptTotpSecret(secret);
  if (lib.decryptTotpSecret(encrypted) !== secret) throw new Error("TOTP secret encryption round-trip failed");
  const uri = lib.buildOtpAuthUrl({ secret, accountLabel: "@midnight", issuer: "NightGram" });
  if (!uri.startsWith("otpauth://totp/") || !uri.includes("issuer=NightGram")) throw new Error("Invalid otpauth URI");
  console.log("Authenticator TOTP utility tests passed.");
} finally {
  Module._load = originalLoad;
}
