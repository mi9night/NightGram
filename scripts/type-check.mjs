import ts from "typescript";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
if (!configPath) {
  console.error("tsconfig.json not found");
  process.exit(1);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([configFile.error], {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => ts.sys.newLine,
  }));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath), {
  noEmit: true,
  incremental: false,
}, configPath);
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => ts.sys.newLine,
  }));
}
console.log(`TypeScript: ${diagnostics.length} diagnostic(s)`);
process.exit(diagnostics.some((item) => item.category === ts.DiagnosticCategory.Error) ? 1 : 0);
