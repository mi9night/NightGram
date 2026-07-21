import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const cleanEnv = { ...process.env };
for (const key of Object.keys(cleanEnv)) {
  if (key.toLowerCase().startsWith("npm_")) delete cleanEnv[key];
}
const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "lint-worker.mjs");
const result = spawnSync(process.execPath, [worker], {
  cwd: process.cwd(),
  env: cleanEnv,
  stdio: "inherit",
  timeout: 600_000,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
