import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/lib/serverHealth.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  for (const error of errors) console.error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  process.exit(1);
}

if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.detail = init.detail;
    }
  };
}
const testWindow = new EventTarget();
globalThis.window = testWindow;
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

const runtimeModule = new Module(sourcePath);
runtimeModule.filename = sourcePath;
runtimeModule.paths = Module._nodeModulePaths(root);
runtimeModule.require = require;
runtimeModule._compile(compiled.outputText, sourcePath);
const health = runtimeModule.exports;

let published = 0;
testWindow.addEventListener(health.SERVER_HEALTH_EVENT, () => { published += 1; });

globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, service: "nightgram" }), {
  status: 200,
  headers: { "content-type": "application/json", "x-request-id": "health-ok" },
});
let result = await health.probeServerHealth({ reason: "test" });
if (result.status !== "healthy" || result.requestId !== "health-ok" || result.service !== "nightgram") {
  throw new Error(`Healthy probe failed: ${JSON.stringify(result)}`);
}

globalThis.fetch = async () => new Response(JSON.stringify({ message: "Слишком много запросов" }), {
  status: 429,
  headers: { "content-type": "application/json" },
});
result = await health.probeServerHealth({ reason: "test" });
if (result.status !== "degraded" || result.statusCode !== 429) {
  throw new Error(`Degraded probe failed: ${JSON.stringify(result)}`);
}

globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
result = await health.probeServerHealth({ reason: "test" });
if (result.status !== "unreachable") {
  throw new Error(`Unreachable probe failed: ${JSON.stringify(result)}`);
}

Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
result = await health.probeServerHealth({ reason: "test" });
if (result.status !== "unreachable" || !String(result.message).includes("интернет")) {
  throw new Error(`Offline probe failed: ${JSON.stringify(result)}`);
}

if (published < 4) throw new Error(`Expected health events, received ${published}`);
console.log("Server health probe tests passed.");
