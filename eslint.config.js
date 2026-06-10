import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const reactRecommended = react.configs.flat.recommended;
const reactJsxRuntime = react.configs.flat["jsx-runtime"];

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/**",
      "scripts/**",
      "supabase/functions/**",
      "archive/**",
      "docs/**",
      "coverage/**",
      ".firecrawl/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...reactRecommended,
    settings: { react: { version: "detect" } },
  },
  reactJsxRuntime,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Correctness — the bugs we actually want to catch
      "no-undef": "error",
      // Base rule stays off: the TS variant below subsumes it and avoids double-reporting.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/no-require-imports": "error",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // Empty catches must say why they swallow (no-empty accepts a block
      // whose only content is a comment) — every existing one already does.
      "no-empty": "error",
      "no-constant-binary-expression": "error",
      "no-useless-escape": "error",
      "no-prototype-builtins": "error",
      "no-case-declarations": "error",
      "no-inner-declarations": "error",
      "no-fallthrough": "error",
    },
  },
  {
    // TypeScript has its own name resolution; no-undef in TS fires on type
    // references like `React.DragEvent` that are fine for tsc. Keep the rule
    // on for .js/.jsx (where it actually catches undeclared-variable bugs).
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "no-undef": "off" },
  },
  {
    // Debt #22 — bare console is banned in app code. Route through
    // src/lib/logger (dev: console; prod: Sentry) so async failures stop
    // disappearing into the void. supabase/functions/** is ignored above:
    // it's Deno, where console IS the logging mechanism (Supabase log
    // explorer captures it).
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: { "no-console": "error" },
  },
  {
    // Carve-outs for the console ban:
    //   - logger.ts is the sink itself
    //   - seed.ts is a CLI script; console is its UI
    //   - transforms.ts has one dev-gated warn
    // Everything else listed here still carries pre-logger call sites and
    // is scheduled for migration in waves 2–3. This list only shrinks —
    // never add to it; use the logger instead.
    files: [
      "src/lib/logger.ts",
      "src/supabase/seed.ts",
      "src/supabase/transforms.ts",
      "src/components/modals/AddHumanModal.jsx",
      "src/components/modals/WaitlistModal.jsx",
      "src/components/modals/human-card/MergeHumanDialog.jsx",
      "src/components/modals/human-card/TrustedHumansPanel.jsx",
      "src/components/ui/Button.jsx",
      "src/components/ui/ErrorBoundary.jsx",
      "src/components/views/inbox/compose-new/ComposeNewModal.jsx",
      "src/components/views/inbox/hooks/useCustomerContext.js",
      "src/components/views/settings/CalendarSettings.jsx",
      "src/engine/bookingRules.ts",
      "src/hooks/useGroomPhotos.js",
      "src/hooks/useReportsData.ts",
      "src/supabase/client.js",
      "src/utils/formatOwnerLabel.js",
    ],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.{js,jsx,ts,tsx}", "**/*.spec.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
];
