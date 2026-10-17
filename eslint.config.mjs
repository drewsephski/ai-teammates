import { defineConfig, globalIgnores } from "eslint/config"
import { fixupConfigRules } from "@eslint/compat"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  // Next's React plugin still calls RuleContext APIs removed in ESLint 10.
  ...fixupConfigRules([...nextVitals, ...nextTs]),
  // Vendored code (shadcn / AI Elements) with known React Compiler lint errors.
  // AGENTS.md says to report these as pre-existing, not fix them, and not to
  // overwrite these files. Scoped to these paths only; the rules stay on elsewhere.
  {
    files: [
      "components/ai-elements/**",
      "components/ui/carousel.tsx",
      "hooks/use-mobile.ts",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    ".artifacts/**",
    ".server/**",
    ".trigger/**",
    "coverage/**",
  ]),
])

export default eslintConfig
