import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      // React 19's compiler-oriented lint rules are valuable for new code, but
      // enabling them as hard errors would require a risky rewrite of existing
      // state synchronization in this compatibility release.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "desktop-runtime/**",
    "release/**",
    "out/**",
    "node_modules/**",
  ]),
]);
