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
      ".ds-sync/**",
      "ds-bundle/**",
      ".firecrawl/**",
      ".claude/**",
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
      // Debt #2: `any` is an ERROR in non-test application code (the block
      // below promotes it) and a warning in tests, where fixtures still
      // carry ~65 sites that shrink as files are touched. The non-test
      // count reached zero on 1 September 2026 (PRs #734, #735); keep it
      // there — type the boundary rather than widening it.
      "@typescript-eslint/no-explicit-any": "warn",
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
      // Debt #24 — the codebase norm is `catch (err)`; single-letter `e`
      // reads as an event param and invites shadowing bugs.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CatchClause > Identifier.param[name='e']",
          message: "Name the catch parameter `err` (the codebase norm — Debt #24).",
        },
      ],
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
    // Debt #2 — no `any` in non-test application code. Test files keep the
    // warning above so fixture shortcuts stay visible without blocking CI.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/test/**"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
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
    // Carve-outs for the console ban (Debt #22) — the only legitimate
    // exemptions now that the rest route through src/lib/logger:
    //   - logger.ts is the sink itself
    //   - seed.ts is a CLI script; console is its UI
    // This list only shrinks — never add to it; use the logger instead.
    // (The engine, src/engine/bookingRules.ts, keeps two dev-only diagnostics
    // via narrow line-scoped eslint-disable comments rather than a whole-file
    // carve-out, because it stays React/Sentry-free and so can't import the
    // logger.)
    files: [
      "src/lib/logger.ts",
      "src/supabase/seed.ts",
    ],
    rules: { "no-console": "off" },
  },
  {
    // Debt #17 — direct localStorage/sessionStorage is banned in app code.
    // Both throw in private/incognito mode, when storage is disabled, or when
    // the quota is full; route through src/lib/storage (safeGet/safeSet/
    // safeRemove) which swallows the failure and returns a sentinel. storage.ts
    // is the sink itself (it's the one place that touches window.localStorage),
    // and tests run against jsdom's real storage, so both are exempt.
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    ignores: [
      "src/lib/storage.ts",
      "**/*.test.{js,jsx,ts,tsx}",
      "**/*.spec.{js,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message:
            "Use safeGet/safeSet/safeRemove from src/lib/storage instead — direct localStorage throws in private mode.",
        },
        {
          name: "sessionStorage",
          message:
            "Use safeGet/safeSet/safeRemove from src/lib/storage instead — direct sessionStorage throws in private mode.",
        },
      ],
    },
  },
  {
    // Debt #12 — components must not import the Supabase client directly and
    // hand-build .from()/.rpc()/auth queries in JSX; that creates a shadow data
    // layer whose RLS behaviour no test can reach. Route through the
    // src/supabase/hooks or src/supabase/repositories layer instead (a component
    // needing offline state should read `isOnline` from props/context, not the
    // client). The `ignores` list is the frozen burn-down baseline of existing
    // offenders — it only SHRINKS as files are migrated to the data layer;
    // never add to it.
    files: ["src/components/**/*.{js,jsx,ts,tsx}"],
    ignores: [
      "**/*.test.{js,jsx,ts,tsx}",
      "**/*.spec.{js,jsx,ts,tsx}",
      "src/components/auth/LoginPage.jsx",
      "src/components/auth/ResetPasswordPage.jsx",
      "src/components/customer/booking/BookingWizard.tsx",
      "src/components/customer/onboarding/AddressPicker.jsx",
      "src/components/customer/onboarding/JoinThePackOnboarding.jsx",
      "src/components/customer/onboarding/ProfileGate.jsx",
      "src/components/customer/onboarding/SetPasswordGate.jsx",
      "src/components/dashboard/TomorrowRemindersCard.jsx",
      "src/components/modals/RescheduleModal.jsx",
      "src/components/modals/booking-detail/DeliveryFailureCard.jsx",
      "src/components/modals/collection-notice/CollectionNoticeModal.jsx",
      "src/components/modals/day-closure/BroadcastMessageModal.jsx",
      "src/components/modals/send-reminder/SendReminderModal.jsx",
      "src/components/views/inbox/compose-new/ComposeNewModal.jsx",
      "src/components/views/inbox/hooks/useCustomerContext.js",
      "src/components/views/inbox/hooks/useInboxMessageSearch.js",
      "src/components/views/inbox/hooks/useSlotCapacityPreview.js",
      "src/components/views/reports/useWeeklyCashUp.js",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/supabase/client",
                "**/supabase/client.js",
                "**/supabase/customerClient",
                "**/supabase/customerClient.js",
              ],
              message:
                "Components must go through src/supabase/hooks or src/supabase/repositories, not the Supabase client directly (Debt #12). Add a repo/hook method; read `isOnline` from props/context for offline checks.",
            },
          ],
        },
      ],
    },
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
