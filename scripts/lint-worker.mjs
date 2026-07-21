import { ESLint } from "eslint";

const eslint = new ESLint();
const results = await eslint.lintFiles([
  "src/**/*.{js,jsx,ts,tsx}",
  "next.config.mjs",
]);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
if (output) process.stdout.write(`${output}\n`);

const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);
const warningCount = results.reduce((sum, result) => sum + result.warningCount, 0);
console.log(`ESLint: ${errorCount} error(s), ${warningCount} warning(s)`);
process.exit(errorCount > 0 ? 1 : 0);
