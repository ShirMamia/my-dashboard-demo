import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { physicalDirectionClass } from "./eslint/physical-direction.mjs";

const physical = physicalDirectionClass.source;
const physicalMessage =
  "Physical-direction class. Use logical utilities (ms-/me-/ps-/pe-/start-/end-/text-start/border-s). MASTER.md §5.";

// Layer boundaries — ARCHITECTURE.md §4.
const frameworkFree = {
  patterns: [
    {
      group: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*"],
      message: "src/domain is framework-free (ARCHITECTURE §4).",
    },
    {
      group: ["@supabase/*"],
      message: "src/domain must not touch the database (ARCHITECTURE §4).",
    },
    {
      group: ["@/app/*", "@/components/*", "@/server/*", "@/lib/*", "@/hooks/*"],
      message: "src/domain may import only from src/domain (ARCHITECTURE §4).",
    },
    {
      group: ["radix-ui", "radix-ui/*", "lucide-react", "cn"],
      message: "src/domain is UI-free (ARCHITECTURE §4).",
    },
  ],
};

const serverNoUi = {
  patterns: [
    {
      group: ["@/app/*", "@/components/*", "@/hooks/*"],
      message: "src/server must not import UI (ARCHITECTURE §4).",
    },
  ],
};

const uiNoSupabase = {
  patterns: [
    {
      group: ["@supabase/*"],
      message:
        "UI must not use Supabase directly. Go through server/data, server/actions or lib/supabase (ARCHITECTURE §4).",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=/${physical}/]`, message: physicalMessage },
        { selector: `TemplateElement[value.raw=/${physical}/]`, message: physicalMessage },
      ],
    },
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: { "no-restricted-imports": ["error", frameworkFree] },
  },
  {
    files: ["src/server/**/*.ts"],
    rules: { "no-restricted-imports": ["error", serverNoUi] },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", uiNoSupabase] },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Disposable Phase 0 prototype; not app code.
    "prototype/**",
    // Claude Code skills tooling; not app code.
    ".claude/**",
  ]),
]);

export default eslintConfig;
