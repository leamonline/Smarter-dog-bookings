# Turnstile Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the login captcha real — stop the Turnstile site key silently falling back to Cloudflare's always-passes test key, make both login pages safe for the owner to switch Supabase CAPTCHA protection on, and provide a repeatable check that proves whether verification is actually enforced.

**Architecture:** A single pure resolver (`src/lib/turnstile.ts`) decides the site key from the environment and fails closed in a production build, mirroring the `supabaseConfigError` idiom already in `src/supabase/client.ts`. Both login pages consume it: no key means no widget, no submit, and a `logger.error` to Sentry. A `scripts/check-captcha-live.mjs` probe answers "is it enforced on the deployed project?" the way `check-sentry-live.mjs` answers the same question for error reporting.

**Tech Stack:** React 19 + Vite 7, TypeScript for logic / JSX for components, Vitest (two projects: `logic` = node, `component` = jsdom), `@marsidev/react-turnstile`, Supabase Auth (GoTrue).

Design spec: `docs/superpowers/specs/2026-09-11-turnstile-verification-design.md`

## Global Constraints

- **UK English** in all user-facing copy and comments (colour, organise, behaviour).
- **No bare `console`** anywhere in `src/` — ESLint fails the build. Use `src/lib/logger.ts`.
- **No `.js`/`.jsx` extension on a relative import whose target is `.ts`/`.tsx`** — `scripts/check-import-extensions.mjs` fails `npm run lint`. Use extensionless specifiers.
- **Never commit a secret, and never put one behind a `VITE_` prefix** — `VITE_` ships to the browser. The Turnstile *site* key is public and belongs in `VITE_`; the *secret* key goes only into the Supabase dashboard and must never enter this repository.
- **Cloudflare's test site key is the literal string `1x00000000000000000000AA`.** It always passes and mints tokens no real secret can verify.
- **The real widget's site key is `0x4AAAAAADMvAmN7LsBYiIqZ`** ("Customer Log-in Capture"). Safe to write in tests and docs; it is public.
- **Tests are forced offline.** `vitest.config.ts` sets `VITE_FORCE_OFFLINE: "1"` on **both** projects. Do not add a project or per-file override without it — `src/supabase/offlineTestGuard.test.ts` fails if you do.
- **Pending-captcha copy is one string, defined once** in `src/lib/turnstile.ts` and imported by both login pages: `"Just finishing the security check — please try again in a moment."`
- **On-screen voice:** warm, calm, plainly said. Never print an env var name on screen — that detail goes to Sentry via `logger.error`.
- **CI bar before the pull request:** `npm run lint`, `npm run check:docs`, `npm run typecheck`, `npm run check:migrations`, `npm run test`, `npm run build`. All six.
- **Do not enable CAPTCHA in the Supabase dashboard.** That is the owner's action and needs the secret key. This plan prepares for it and verifies it afterwards.
- **The check script must never probe `/auth/v1/otp`.** If captcha is not enforced that endpoint sends a real SMS, at real cost, possibly to a real person.

---

### Task 1: Site key resolver

The one decision point: given the environment, which site key do we render, and is this deploy misconfigured? Pure function so the truth table is testable without rebuilding the app, with a thin module binding reading `import.meta.env` on top — the same split as `classifySentryChunk` in `scripts/check-sentry-live.mjs`.

**Files:**
- Create: `src/lib/turnstile.ts`
- Test: `src/lib/turnstile.test.ts`

**Interfaces:**
- Consumes: `logger` from `src/lib/logger.ts` (already exists; exports `logger.error` and `logger.warn`).
- Produces, all imported by Tasks 2 and 3:
  - `TURNSTILE_TEST_SITE_KEY: string` — the literal `"1x00000000000000000000AA"`.
  - `CAPTCHA_PENDING_ERROR: string` — the pending-captcha copy.
  - `interface TurnstileConfig { siteKey: string | null; configError: string | null; usingTestKey: boolean }`
  - `resolveTurnstileConfig(env: TurnstileEnvironment): TurnstileConfig` where `TurnstileEnvironment` is `{ siteKey?: string | null; forceOffline?: boolean; isProduction?: boolean }`.
  - `turnstileConfig: TurnstileConfig` — the resolved module-level singleton the components read.

- [ ] **Step 1: Write the failing test**

Create `src/lib/turnstile.test.ts`:

```ts
// Guards the decision that used to be a one-line `??` fallback to Cloudflare's
// always-passes test key. On 11 September 2026 that fallback meant any
// environment missing VITE_TURNSTILE_SITE_KEY silently rendered a captcha that
// could not fail — production included. These tests pin every branch of the
// replacement, because the failure mode is invisible: a widget that always
// passes looks exactly like a widget that works.
import { describe, expect, it } from "vitest";
import { resolveTurnstileConfig, TURNSTILE_TEST_SITE_KEY } from "./turnstile";

// The real "Customer Log-in Capture" widget. Public, so safe to write here.
const REAL_KEY = "0x4AAAAAADMvAmN7LsBYiIqZ";

describe("resolveTurnstileConfig", () => {
  it("uses a configured site key in production", () => {
    expect(
      resolveTurnstileConfig({ siteKey: REAL_KEY, isProduction: true }),
    ).toEqual({ siteKey: REAL_KEY, configError: null, usingTestKey: false });
  });

  it("trims whitespace around a configured key", () => {
    expect(
      resolveTurnstileConfig({ siteKey: `  ${REAL_KEY}  `, isProduction: true })
        .siteKey,
    ).toBe(REAL_KEY);
  });

  it("blocks a production build with no site key", () => {
    const config = resolveTurnstileConfig({
      siteKey: undefined,
      isProduction: true,
    });
    expect(config.siteKey).toBeNull();
    expect(config.usingTestKey).toBe(false);
    expect(config.configError).toContain("VITE_TURNSTILE_SITE_KEY");
  });

  it("treats a blank site key as missing", () => {
    // Vite hands `VITE_TURNSTILE_SITE_KEY=` through as an empty string, which
    // `??` accepted and passed straight to the widget.
    expect(
      resolveTurnstileConfig({ siteKey: "", isProduction: true }).siteKey,
    ).toBeNull();
    expect(
      resolveTurnstileConfig({ siteKey: "   ", isProduction: true }).siteKey,
    ).toBeNull();
  });

  it("blocks a production build that sets the test key explicitly", () => {
    // Otherwise the rule has a loophole that spells itself out in an env file
    // and looks deliberate.
    const config = resolveTurnstileConfig({
      siteKey: TURNSTILE_TEST_SITE_KEY,
      isProduction: true,
    });
    expect(config.siteKey).toBeNull();
    expect(config.configError).toContain("always-passes");
  });

  it("falls back to the test key in development", () => {
    expect(
      resolveTurnstileConfig({ siteKey: undefined, isProduction: false }),
    ).toEqual({
      siteKey: TURNSTILE_TEST_SITE_KEY,
      configError: null,
      usingTestKey: true,
    });
  });

  it("short-circuits on forceOffline ahead of every other rule", () => {
    // E2E runs `npm run build` — so PROD is true — with VITE_FORCE_OFFLINE=1
    // and no site key. Without this carve-out every login spec fails closed.
    expect(
      resolveTurnstileConfig({
        siteKey: undefined,
        forceOffline: true,
        isProduction: true,
      }),
    ).toEqual({
      siteKey: TURNSTILE_TEST_SITE_KEY,
      configError: null,
      usingTestKey: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project logic src/lib/turnstile.test.ts
```

Expected: FAIL — `Failed to resolve import "./turnstile"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/turnstile.ts`:

```ts
// Which Turnstile site key does this build render, and is this deploy
// misconfigured?
//
// Until 11 September 2026 the answer was a one-line fallback to Cloudflare's
// published test key, which always passes. Any environment missing
// VITE_TURNSTILE_SITE_KEY therefore showed visitors a security check that
// could not fail — and said nothing about it. That is worse than no captcha,
// because the widget invites the assumption of safety.
//
// The shape here deliberately mirrors `supabaseConfigError` in
// src/supabase/client.ts: resolve, expose a configError, fail closed in a
// production build, degrade to something usable in development.
import { logger } from "./logger";

/**
 * Cloudflare's published test site key. It always passes, and mints tokens
 * that no real secret key can verify. A development convenience only — never
 * a production fallback.
 */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

/**
 * Shown when the visitor submits before the widget has produced a token.
 * Lives here so the staff and customer pages say exactly the same thing.
 */
export const CAPTCHA_PENDING_ERROR =
  "Just finishing the security check — please try again in a moment.";

export interface TurnstileEnvironment {
  siteKey?: string | null;
  forceOffline?: boolean;
  isProduction?: boolean;
}

export interface TurnstileConfig {
  /** The site key to render, or null when the deploy is misconfigured. */
  siteKey: string | null;
  /** Why sign-in is blocked, or null when all is well. */
  configError: string | null;
  /** True when the always-passes test key is in use. */
  usingTestKey: boolean;
}

const MISSING_KEY_ERROR = "Missing VITE_TURNSTILE_SITE_KEY";
const TEST_KEY_IN_PRODUCTION_ERROR =
  "VITE_TURNSTILE_SITE_KEY is set to Cloudflare's always-passes test key";

export function resolveTurnstileConfig({
  siteKey,
  forceOffline = false,
  isProduction = false,
}: TurnstileEnvironment): TurnstileConfig {
  // Offline/sample-data mode short-circuits everything: there is no Supabase
  // client, so there is no auth call for a captcha to protect. This must come
  // first — E2E builds are production builds (`npm run build`) carrying
  // VITE_FORCE_OFFLINE=1 and no site key, so without it every login spec
  // would fail closed. src/supabase/client.ts short-circuits identically.
  if (forceOffline) {
    return {
      siteKey: TURNSTILE_TEST_SITE_KEY,
      configError: null,
      usingTestKey: true,
    };
  }

  // Blank counts as absent: `VITE_TURNSTILE_SITE_KEY=` arrives as an empty
  // string, which the old `??` accepted and handed to the widget.
  const configured = typeof siteKey === "string" ? siteKey.trim() : "";

  if (configured && configured !== TURNSTILE_TEST_SITE_KEY) {
    return { siteKey: configured, configError: null, usingTestKey: false };
  }

  // Either nothing is set, or the test key is set explicitly. In production
  // both mean the same thing — no real challenge — so both fail closed.
  if (isProduction) {
    return {
      siteKey: null,
      configError: configured ? TEST_KEY_IN_PRODUCTION_ERROR : MISSING_KEY_ERROR,
      usingTestKey: false,
    };
  }

  return {
    siteKey: TURNSTILE_TEST_SITE_KEY,
    configError: null,
    usingTestKey: true,
  };
}

const forceOffline = import.meta.env.VITE_FORCE_OFFLINE === "1";

export const turnstileConfig = resolveTurnstileConfig({
  siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  forceOffline,
  isProduction: import.meta.env.PROD,
});

if (turnstileConfig.configError) {
  // logger.error forwards to Sentry, live in production since 28 August 2026.
  // This is where the actionable detail goes; the on-screen copy stays calm
  // and free of variable names.
  logger.error(
    `[Smarter Dog] ${turnstileConfig.configError}. Sign-in is blocked until a real ` +
      "Turnstile site key is set on the host (Vercel) and the app is redeployed.",
  );
} else if (turnstileConfig.usingTestKey && !forceOffline) {
  logger.warn(
    "Turnstile is using Cloudflare's always-passes test key — this challenge " +
      "cannot fail. Set VITE_TURNSTILE_SITE_KEY in .env.local to exercise the " +
      "real widget. A production build without it blocks sign-in instead.",
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run --project logic src/lib/turnstile.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/turnstile.ts src/lib/turnstile.test.ts
git commit -m "feat(auth): resolve the Turnstile site key, failing closed in production

The site key was a one-line fallback to Cloudflare's always-passes test
key, so any environment missing VITE_TURNSTILE_SITE_KEY silently rendered
a captcha that could not fail. An empty string slipped through too --
\`??\` only catches undefined.

Replaces it with a pure resolver: a real key wins; forceOffline
short-circuits first so E2E (a production build with no key) keeps
working; a production build with no key, or with the test key set
explicitly, reports a configError and renders no widget at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Staff login page — fail closed and guard the token

Two changes that together make the staff page safe for the Supabase toggle. The page currently omits the captcha option entirely when the ref is empty (`...(captchaToken ? { options: { captchaToken } } : {})`), so with protection on, a staff member submitting before the widget settles gets a raw `captcha protection: request disallowed` from Supabase.

**Files:**
- Modify: `src/components/auth/LoginPage.jsx` — lines 1-11 (imports and the test-key constant), 105-148 (both handlers), 226-242 and 341-353 (the two Turnstile render sites), 249-256 and 356-360 (the two submit buttons)
- Test: `src/components/auth/LoginPage.component.test.jsx` (create)

**Interfaces:**
- Consumes: `turnstileConfig`, `CAPTCHA_PENDING_ERROR` from `src/lib/turnstile.ts` (Task 1).
- Produces: nothing other tasks import. `LoginPage({ onSignIn, error, isOffline })` keeps its existing props.

- [ ] **Step 1: Write the failing test**

Create `src/components/auth/LoginPage.component.test.jsx`:

```jsx
// The staff login page's captcha behaviour, which is invisible until Supabase
// CAPTCHA protection is switched on and then decides whether anyone can sign
// in at all. Two things are pinned: a deploy with no site key blocks sign-in
// rather than showing a challenge that always passes, and a submit before the
// widget has produced a token is caught here rather than by Supabase (which
// answers with a raw "captcha protection: request disallowed").
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.mock factories are hoisted above the file's own consts, so anything they
// close over has to come from vi.hoisted.
const mocks = vi.hoisted(() => ({
  turnstileConfig: { siteKey: "0xTEST", configError: null, usingTestKey: false },
  requestPasswordReset: vi.fn(async () => ({ error: null })),
}));

// The real widget injects Cloudflare's challenge script, which jsdom cannot
// run. This stand-in hands back a token only when clicked, which is exactly
// the distinction under test: resolved versus not yet resolved.
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess("solved-token")}>
      solve captcha
    </button>
  ),
}));

vi.mock("../../lib/turnstile", () => ({
  get turnstileConfig() {
    return mocks.turnstileConfig;
  },
  CAPTCHA_PENDING_ERROR:
    "Just finishing the security check — please try again in a moment.",
}));

vi.mock("../../supabase/hooks/useStaffAuthActions", () => ({
  useStaffAuthActions: () => ({
    requestPasswordReset: mocks.requestPasswordReset,
  }),
}));

import { LoginPage } from "./LoginPage.jsx";

beforeEach(() => {
  mocks.turnstileConfig = {
    siteKey: "0xTEST",
    configError: null,
    usingTestKey: false,
  };
  mocks.requestPasswordReset.mockClear();
});

async function fillCredentials(user) {
  await user.type(screen.getByLabelText("Email"), "staff@smarterdog.co.uk");
  await user.type(screen.getByLabelText("Password"), "correct-horse");
}

describe("LoginPage captcha handling", () => {
  it("signs in with the token once the widget has resolved", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn(async () => ({ error: null }));
    render(<LoginPage onSignIn={onSignIn} error="" isOffline={false} />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "solve captcha" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSignIn).toHaveBeenCalledWith(
      "staff@smarterdog.co.uk",
      "correct-horse",
      "solved-token",
    );
  });

  it("refuses to submit before the widget has produced a token", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn(async () => ({ error: null }));
    render(<LoginPage onSignIn={onSignIn} error="" isOffline={false} />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSignIn).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Just finishing the security check — please try again in a moment.",
      ),
    ).toBeInTheDocument();
  });

  it("refuses a password reset before the widget has produced a token", async () => {
    const user = userEvent.setup();
    render(<LoginPage onSignIn={vi.fn()} error="" isOffline={false} />);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "staff@smarterdog.co.uk");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("blocks sign-in and renders no widget when no site key is configured", async () => {
    mocks.turnstileConfig = {
      siteKey: null,
      configError: "Missing VITE_TURNSTILE_SITE_KEY",
      usingTestKey: false,
    };
    const onSignIn = vi.fn(async () => ({ error: null }));
    render(<LoginPage onSignIn={onSignIn} error="" isOffline={false} />);

    // No challenge at all, rather than one that always passes.
    expect(
      screen.queryByRole("button", { name: "solve captcha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByText("Sign-in is unavailable right now")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project component src/components/auth/LoginPage.component.test.jsx
```

Expected: FAIL — the sign-in test passes `null` as the third argument, the pending-error tests find no such text, and the config-error test finds an enabled button and no "Sign-in is unavailable right now".

- [ ] **Step 3: Replace the test-key constant with the resolver**

In `src/components/auth/LoginPage.jsx`, replace lines 1-11:

```jsx
import { useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useStaffAuthActions } from "../../supabase/hooks/useStaffAuthActions";
import { ScribbleUnderline } from "../ui/ScribbleUnderline.jsx";
import { DogSilhouetteScatter } from "./DogSilhouetteScatter.jsx";

// Cloudflare's published test key — always passes, no real challenge.
// Supabase accepts it when the project's Turnstile secret key is also the
// matching test secret (0x4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA).
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
```

with:

```jsx
import { useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useStaffAuthActions } from "../../supabase/hooks/useStaffAuthActions";
import { ScribbleUnderline } from "../ui/ScribbleUnderline.jsx";
import { DogSilhouetteScatter } from "./DogSilhouetteScatter.jsx";
import { turnstileConfig, CAPTCHA_PENDING_ERROR } from "../../lib/turnstile";
```

- [ ] **Step 4: Add the blocked-state panel**

In `src/components/auth/LoginPage.jsx`, immediately above `export function LoginPage(` (just after the `PortalShell` component and its docblock), insert:

```jsx
/**
 * Stands in for the security check when the deploy carries no Turnstile site
 * key. Sign-in is blocked rather than quietly allowed through: a captcha that
 * always passes is worse than none, because it invites the assumption of
 * safety. The actionable detail — which variable is missing — goes to Sentry
 * from src/lib/turnstile.ts, not onto a staff member's screen.
 */
function CaptchaUnavailable() {
  return (
    <div role="alert" className="text-center">
      <p className="text-sm font-bold text-[var(--sd-navy)] mb-1">
        Sign-in is unavailable right now
      </p>
      <p className="text-xs text-[var(--sd-ink-light)] leading-relaxed">
        The security check can&apos;t load, so we can&apos;t sign anyone in
        until it&apos;s sorted. Please try again shortly.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Guard both handlers**

In `LoginPage`, immediately after the `const [resetError, setResetError] = useState("");` line and before the refs, add:

```jsx
  // Null only when the deploy is misconfigured; src/lib/turnstile.ts has
  // already reported it to Sentry by the time we render.
  const captchaUnavailable = turnstileConfig.configError !== null;
```

In `handleResetPassword`, replace lines 107-117:

```jsx
    if (!resetEmail.trim()) {
      setResetError("We need your email to send the reset link.");
      return;
    }
    setResetSending(true);
    setResetError("");
    const captchaToken = resetCaptchaRef.current;
    const { error: err } = await authActions.requestPasswordReset(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
      ...(captchaToken ? { captchaToken } : {}),
    });
```

with:

```jsx
    if (!resetEmail.trim()) {
      setResetError("We need your email to send the reset link.");
      return;
    }
    // With Supabase CAPTCHA protection on, sending without a token gets a raw
    // "captcha protection: request disallowed" back. Catch it here instead,
    // and send the token unconditionally now that we know we have one.
    if (!resetCaptchaRef.current) {
      setResetError(CAPTCHA_PENDING_ERROR);
      return;
    }
    setResetSending(true);
    setResetError("");
    const { error: err } = await authActions.requestPasswordReset(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: resetCaptchaRef.current,
    });
```

In `handleSubmit`, replace lines 130-135:

```jsx
    if (!email.trim() || !password.trim()) {
      setLocalError("We need both your email and password.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
```

with:

```jsx
    if (!email.trim() || !password.trim()) {
      setLocalError("We need both your email and password.");
      return;
    }
    if (!signInCaptchaRef.current) {
      setLocalError(CAPTCHA_PENDING_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
```

- [ ] **Step 6: Make both render sites conditional**

In the sign-in form, replace the security-check block (the `<div className="rounded-xl border border-transparent sm:border-…">` and its contents):

```jsx
          <div className="rounded-xl border border-transparent sm:border-[rgba(45,0,75,0.08)] bg-transparent sm:bg-[var(--sd-sky-tint)]/40 px-0 sm:px-4 py-0 sm:py-4">
            {captchaUnavailable ? (
              <CaptchaUnavailable />
            ) : (
              <>
                <p className={`${kickerClass} text-center mb-2 sm:mb-3 hidden sm:block`}>
                  Quick security check
                </p>
                <div className="flex justify-center">
                  <Turnstile
                    ref={signInTurnstileRef}
                    siteKey={turnstileConfig.siteKey}
                    onSuccess={(token) => { signInCaptchaRef.current = token; }}
                    onExpire={() => { signInCaptchaRef.current = null; }}
                    onError={() => { signInCaptchaRef.current = null; }}
                    options={{ theme: "light", size: "normal" }}
                  />
                </div>
                <p className="text-xs text-[var(--sd-ink-light)] text-center mt-2 sm:mt-3 leading-relaxed hidden sm:block">
                  Just confirms you&apos;re human — no clicks needed.
                </p>
              </>
            )}
          </div>
```

In the reset form, replace its security-check block the same way:

```jsx
        <div className="rounded-xl border border-[rgba(45,0,75,0.08)] bg-[var(--sd-sky-tint)]/40 px-4 py-2 sm:py-4">
          {captchaUnavailable ? (
            <CaptchaUnavailable />
          ) : (
            <>
              <p className={`${kickerClass} text-center mb-2 sm:mb-3 hidden sm:block`}>
                Quick security check
              </p>
              <div className="flex justify-center">
                <Turnstile
                  ref={resetTurnstileRef}
                  siteKey={turnstileConfig.siteKey}
                  onSuccess={(token) => { resetCaptchaRef.current = token; }}
                  onExpire={() => { resetCaptchaRef.current = null; }}
                  onError={() => { resetCaptchaRef.current = null; }}
                  options={{ theme: "light", size: "normal" }}
                />
              </div>
            </>
          )}
        </div>
```

- [ ] **Step 7: Disable both submit buttons when the captcha is unavailable**

Sign-in button — change `disabled={submitting}` to:

```jsx
            disabled={submitting || captchaUnavailable}
            aria-busy={submitting}
```

Reset button — change `disabled={resetSending}` to:

```jsx
          disabled={resetSending || captchaUnavailable}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npx vitest run --project component src/components/auth/LoginPage.component.test.jsx
```

Expected: PASS, 4 tests.

- [ ] **Step 9: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: both clean. If `check-import-extensions` complains, the `../../lib/turnstile` import must stay extensionless — its target is `.ts`.

- [ ] **Step 10: Commit**

```bash
git add src/components/auth/LoginPage.jsx src/components/auth/LoginPage.component.test.jsx
git commit -m "feat(auth): fail closed and guard the captcha token on staff login

Two changes that together make this page safe for Supabase CAPTCHA
protection to be switched on.

A deploy with no Turnstile site key now renders no widget and disables
sign-in, instead of showing a challenge that always passes.

Sign-in and password reset both refuse to submit until the widget has
produced a token. They previously dropped the captcha option entirely
when the ref was empty, so with protection on a staff member who hit
Enter early would get a raw 'captcha protection: request disallowed'
from Supabase.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Customer login page — fail closed

The customer page already guards the missing-token case (`CAPTCHA_PENDING_ERROR`, defined locally), so only the fail-closed half is new. The local copy of the pending string is replaced by the shared one so the two pages cannot drift.

**Files:**
- Modify: `src/components/auth/CustomerLoginPage.jsx` — lines 1-19 (imports, the test-key constant, the local `CAPTCHA_PENDING_ERROR`), 312-335 (`turnstilePanel`), and the three submit buttons
- Test: `src/components/auth/CustomerLoginPage.component.test.jsx` (create)

**Interfaces:**
- Consumes: `turnstileConfig`, `CAPTCHA_PENDING_ERROR` from `src/lib/turnstile.ts` (Task 1).
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing test**

Create `src/components/auth/CustomerLoginPage.component.test.jsx`:

```jsx
// The customer login page's fail-closed behaviour. The missing-token guard
// already existed here; what is new is that a deploy with no Turnstile site
// key renders no challenge at all rather than one that always passes.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  turnstileConfig: { siteKey: "0xTEST", configError: null, usingTestKey: false },
}));

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess("solved-token")}>
      solve captcha
    </button>
  ),
}));

vi.mock("../../lib/turnstile", () => ({
  get turnstileConfig() {
    return mocks.turnstileConfig;
  },
  CAPTCHA_PENDING_ERROR:
    "Just finishing the security check — please try again in a moment.",
}));

import { CustomerLoginPage } from "./CustomerLoginPage.jsx";

// The page's full prop set. otpSent false keeps it on the phone stage, which
// is the one that renders the shared turnstilePanel first.
function renderPage() {
  return render(
    <CustomerLoginPage
      onCheckPhone={vi.fn(async () => ({ on_file: true, has_password: true }))}
      onSendOtp={vi.fn(async () => ({}))}
      onSignInWithPassword={vi.fn(async () => ({}))}
      onVerifyOtp={vi.fn(async () => ({}))}
      onResetOtp={vi.fn(async () => ({}))}
      otpSent={false}
      phone=""
      error=""
    />,
  );
}

beforeEach(() => {
  mocks.turnstileConfig = {
    siteKey: "0xTEST",
    configError: null,
    usingTestKey: false,
  };
});

describe("CustomerLoginPage captcha handling", () => {
  it("renders the challenge when a site key is configured", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: "solve captcha" }),
    ).toBeInTheDocument();
  });

  it("renders no challenge and disables the form when no site key is configured", () => {
    mocks.turnstileConfig = {
      siteKey: null,
      configError: "Missing VITE_TURNSTILE_SITE_KEY",
      usingTestKey: false,
    };
    renderPage();

    expect(
      screen.queryByRole("button", { name: "solve captcha" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Signing in is unavailable right now"),
    ).toBeInTheDocument();
    // "Continue" is the phone stage's submit; the signup and password stages
    // render their own, which Step 5 disables the same way.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project component src/components/auth/CustomerLoginPage.component.test.jsx
```

Expected: FAIL on the second test — the widget still renders and the buttons are enabled.

- [ ] **Step 3: Replace the constant and the local copy string**

In `src/components/auth/CustomerLoginPage.jsx`, replace lines 1-19's Turnstile constant and local error:

```jsx
// Cloudflare's published test key — always passes, no real challenge.
// Supabase accepts it as long as the project's Turnstile secret key is also
// the matching test secret (0x4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA).
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
```

is deleted, and:

```jsx
const CAPTCHA_PENDING_ERROR = "Just finishing the security check — please try again in a moment.";
```

is deleted too. Add to the import block at the top:

```jsx
import { turnstileConfig, CAPTCHA_PENDING_ERROR } from "../../lib/turnstile";
```

- [ ] **Step 4: Make the shared panel conditional**

Replace the `turnstilePanel` definition:

```jsx
  // Null only when the deploy is misconfigured; src/lib/turnstile.ts has
  // already reported it to Sentry by the time we render.
  const captchaUnavailable = turnstileConfig.configError !== null;

  // Shared Turnstile panel for the stages that make a Supabase auth call.
  // With no site key we show nothing to solve and block the form: a captcha
  // that always passes is worse than none, because it invites the assumption
  // of safety.
  const turnstilePanel = (
    <div className="rounded-xl border border-[rgba(45,0,75,0.08)] bg-[var(--sd-sky-tint)]/40 px-4 py-4">
      {captchaUnavailable ? (
        <div role="alert" className="text-center">
          <p className="text-sm font-bold text-[var(--sd-navy)] mb-1">
            Signing in is unavailable right now
          </p>
          <p className="text-[12px] text-[var(--sd-ink-light)] leading-relaxed">
            The security check can&apos;t load, so we can&apos;t sign you in
            just yet. Please try again shortly — or give the salon a ring and
            we&apos;ll sort you out.
          </p>
        </div>
      ) : (
        <>
          <p className="portal-text-kicker text-center mb-3">Quick security check</p>
          <div className="flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={turnstileConfig.siteKey}
              onSuccess={(token) => {
                captchaTokenRef.current = token;
              }}
              onExpire={() => {
                captchaTokenRef.current = null;
              }}
              onError={() => {
                captchaTokenRef.current = null;
              }}
              options={{ theme: "light", size: "normal" }}
            />
          </div>
          <p className="text-[12px] text-[var(--sd-ink-light)] text-center mt-3 leading-relaxed">
            Just confirms you&apos;re human — no clicks needed.
          </p>
        </>
      )}
    </div>
  );
```

- [ ] **Step 5: Disable all three submit buttons**

The page has three `type="submit"` buttons using `submitButtonClass`. Change each `disabled` prop to include `captchaUnavailable`:

- the two reading `disabled={submitting || otpCooldown > 0}` become `disabled={submitting || otpCooldown > 0 || captchaUnavailable}`
- the one reading `disabled={submitting}` becomes `disabled={submitting || captchaUnavailable}`

Verify all three were changed:

```bash
grep -c "captchaUnavailable" src/components/auth/CustomerLoginPage.jsx
```

Expected: `5` — one declaration, one in the panel, three in buttons.

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run --project component src/components/auth/CustomerLoginPage.component.test.jsx
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/auth/CustomerLoginPage.jsx src/components/auth/CustomerLoginPage.component.test.jsx
git commit -m "feat(auth): fail closed on the customer login captcha

A deploy with no Turnstile site key now renders no challenge and disables
every submit on the page, instead of falling back to Cloudflare's
always-passes test key.

Also drops the local copy of the pending-captcha string in favour of the
shared one, so the staff and customer pages cannot drift apart on what
they say.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `npm run check:captcha`

The evidence half. This repository already treats "is this control actually live in production?" as a repeatable script rather than a dashboard screenshot — `check:sentry` exists because establishing the answer once took fetching and grepping 106 bundle chunks. This is the same class of question.

**Files:**
- Create: `scripts/check-captcha-live.mjs`
- Create: `src/security/captchaLiveCheck.test.ts`
- Modify: `package.json` — the `scripts` block, next to `check:sentry`

**Interfaces:**
- Consumes: nothing from earlier tasks. Standalone.
- Produces: `classifyCaptchaResponse(body: unknown): "enforced" | "not-enforced" | "unknown"`, imported by the test.

- [ ] **Step 1: Write the failing test**

Create `src/security/captchaLiveCheck.test.ts`:

```ts
// Guards scripts/check-captcha-live.mjs — the check that answers "is the login
// captcha actually enforced on this project?".
//
// The question matters because nothing in the app can tell you. The Turnstile
// widget issues a challenge, the visitor solves it, and the token goes to
// Supabase as options.captchaToken — which Supabase ignores unless CAPTCHA
// protection is enabled under Authentication -> Attack Protection. On
// 11 September 2026 it was not: Cloudflare reported 0 siteverify requests
// against 5 solved challenges, and a probe of the production token endpoint
// reached the password check both with an invalid token and with none at all.
//
// The verdict is three-state on purpose. Guessing is what produced the
// original problem, so an unrecognised response says so rather than picking
// the reassuring answer.
import { describe, expect, it } from "vitest";
import { classifyCaptchaResponse } from "../../scripts/check-captcha-live.mjs";

describe("classifyCaptchaResponse", () => {
  it("reads a captcha rejection as enforced", () => {
    expect(
      classifyCaptchaResponse({
        code: 400,
        error_code: "validation_failed",
        msg: "captcha protection: request disallowed (invalid-input-response)",
      }),
    ).toBe("enforced");
    expect(
      classifyCaptchaResponse({
        code: 400,
        error_code: "validation_failed",
        msg: "captcha protection: request disallowed (missing-input-response)",
      }),
    ).toBe("enforced");
  });

  it("reads a password rejection as not enforced", () => {
    // Verbatim from the production probe on 11 September 2026. Reaching the
    // password check at all means the captcha was never consulted.
    expect(
      classifyCaptchaResponse({
        code: 400,
        error_code: "invalid_credentials",
        msg: "Invalid login credentials",
      }),
    ).toBe("not-enforced");
  });

  it("understands the older GoTrue error shape too", () => {
    // Older releases answer with error/error_description rather than
    // error_code/msg. A project on either shape must classify the same.
    expect(
      classifyCaptchaResponse({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      }),
    ).toBe("not-enforced");
    expect(
      classifyCaptchaResponse({
        error: "validation_failed",
        error_description: "captcha protection: request disallowed",
      }),
    ).toBe("enforced");
  });

  it("says unknown rather than guessing", () => {
    // Saying "enforced" on no evidence is the one answer that would let the
    // unverified state persist unnoticed — the exact failure being fixed.
    expect(classifyCaptchaResponse({})).toBe("unknown");
    expect(classifyCaptchaResponse(null)).toBe("unknown");
    expect(classifyCaptchaResponse("rate limited")).toBe("unknown");
    expect(
      classifyCaptchaResponse({ error_code: "over_request_rate_limit" }),
    ).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --project logic src/security/captchaLiveCheck.test.ts
```

Expected: FAIL — cannot resolve `../../scripts/check-captcha-live.mjs`.

- [ ] **Step 3: Write the script**

Create `scripts/check-captcha-live.mjs`:

```js
// Is the login captcha actually ENFORCED on a deployed Supabase project?
//
// WHY THIS EXISTS
//
// Both login pages render a Cloudflare Turnstile widget, the visitor solves
// it, and the token is handed to Supabase as options.captchaToken. Supabase
// only checks it — by calling Cloudflare's siteverify endpoint — when CAPTCHA
// protection is enabled under Authentication -> Attack Protection. With the
// setting off, the token is accepted, ignored and discarded, and everything
// looks exactly the same from the outside.
//
// On 11 September 2026 that was the live state. The widget reported 0
// siteverify requests against 5 solved challenges in 24 hours, while the
// README, the architecture overview and a code comment all described Turnstile
// as active login protection.
//
// THE SIGNAL
//
// GoTrue applies captcha verification as middleware, before the credential
// check. So a deliberately wrong password tells you which one ran first:
//
//   enforced      -> "captcha protection: request disallowed (...)"
//   not enforced  -> "Invalid login credentials"
//
// This asks about a PROJECT's live configuration, not about a build, which is
// why it cannot be answered by reading the bundle the way check-sentry-live
// does.
//
// SAFETY
//
// The probe signs in as a nonsense address in the reserved .invalid TLD, so it
// cannot match a real account and cannot cause mail to be sent. It carries no
// real credentials and writes nothing.
//
// It probes the PASSWORD grant only. Never point this at /auth/v1/otp: if
// captcha is not enforced, that endpoint sends a real SMS, at real cost,
// possibly to a real person. The password grant shares the same captcha
// middleware and answers the same question for free.
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

// Reserved TLD (RFC 2606) — resolves nowhere and can match no account.
const PROBE_EMAIL = "captcha-probe@smarter-dog.invalid";
const PROBE_PASSWORD = "not-a-real-password";
const INVALID_CAPTCHA_TOKEN = "definitely-not-a-valid-turnstile-token";

/**
 * Which check ran first — the captcha, or the password?
 *
 * Three-state on purpose. Guessing produced the original problem, so an
 * unrecognised response says "unknown" rather than picking the reassuring
 * answer.
 */
export function classifyCaptchaResponse(body) {
  if (!body || typeof body !== "object") return "unknown";

  // GoTrue answers with error_code/msg on current releases and
  // error/error_description on older ones. Read both.
  const message =
    (typeof body.msg === "string" && body.msg) ||
    (typeof body.error_description === "string" && body.error_description) ||
    "";
  const code = body.error_code || body.error;

  if (/captcha protection/i.test(message)) return "enforced";
  if (code === "invalid_credentials" || code === "invalid_grant") {
    return "not-enforced";
  }
  return "unknown";
}

// Tiny .env.local loader — no extra dep. Deliberately a local copy of the one
// in scripts/seed-first-owner.mjs rather than a shared import: that script
// handles the service-role key, and it is not worth perturbing to save fifteen
// lines here. Extract if a third caller appears.
function loadEnvLocal() {
  try {
    const raw = readFileSync(
      path.join(scriptDirectory, "..", ".env.local"),
      "utf8",
    );
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env.local — fine if the caller passed flags or exported vars.
  }
}

function readFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * One probe. Returns the verdict plus the raw body, so an "unknown" can be
 * shown rather than described.
 */
async function probe({ url, key, captchaToken }) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: PROBE_EMAIL,
      password: PROBE_PASSWORD,
      ...(captchaToken
        ? { gotrue_meta_security: { captcha_token: captchaToken } }
        : {}),
    }),
  });
  const body = await response.json().catch(() => null);
  return { verdict: classifyCaptchaResponse(body), body, status: response.status };
}

async function main() {
  loadEnvLocal();

  // Both values are public — the publishable key ships in the browser bundle.
  const url = (readFlag("url") || process.env.VITE_SUPABASE_URL || "").replace(
    /\/+$/,
    "",
  );
  const key =
    readFlag("key") ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Need a Supabase URL and publishable key. Set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_PUBLISHABLE_KEY (in .env.local or the shell), or pass " +
        "--url and --key. Both are public values.",
    );
  }

  process.stdout.write(`Checking login captcha enforcement at ${url}\n`);

  const probes = [
    { label: "invalid captcha token", captchaToken: INVALID_CAPTCHA_TOKEN },
    { label: "no captcha token", captchaToken: null },
  ];

  const results = [];
  for (const { label, captchaToken } of probes) {
    const result = await probe({ url, key, captchaToken });
    results.push({ label, ...result });
    process.stdout.write(`  ${label} — ${result.verdict} (HTTP ${result.status})\n`);
    if (result.verdict === "unknown") {
      process.stdout.write(`    ${JSON.stringify(result.body)}\n`);
    }
  }

  if (results.some((result) => result.verdict === "unknown")) {
    process.stdout.write(
      "\nUNKNOWN: a probe came back in a shape this check does not recognise.\n" +
        "Rate limiting is the usual cause — wait a minute and run it again.\n" +
        "Do not read this as either verdict.\n",
    );
    return 2;
  }

  if (results.every((result) => result.verdict === "enforced")) {
    process.stdout.write(
      "\nLogin captcha is ENFORCED: Supabase refused both an invalid token and\n" +
        "a missing one before ever reaching the password check.\n",
    );
    return 0;
  }

  process.stdout.write(
    "\nLogin captcha is NOT ENFORCED: Supabase reached the password check with\n" +
      "a bad captcha token. The Turnstile widget on the login pages is being\n" +
      "solved and then ignored — no siteverify call is made.\n" +
      "Enable CAPTCHA under Authentication -> Attack Protection. See\n" +
      "docs/superpowers/runbooks/2026-09-11-login-captcha-enablement.md\n",
  );
  return 1;
}

// Exit code carries the verdict. Deliberately NOT wired into CI: like
// check:sentry this needs the network and a live project, and asks about a
// deployed configuration rather than about the code under test.
//
// Guarded so the pure classifier above can be imported by tests without firing
// a network request, matching scripts/check-sentry-live.mjs.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`check-captcha-live failed: ${error.message}\n`);
      process.exit(2);
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run --project logic src/security/captchaLiveCheck.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Register the npm script**

In `package.json`, immediately after the `"check:sentry"` line, add:

```json
    "check:captcha": "node scripts/check-captcha-live.mjs",
```

- [ ] **Step 6: Capture the baseline**

```bash
npm run check:captcha
```

Expected on 11 September 2026, **before** the owner enables the setting:

```
  invalid captcha token — not-enforced (HTTP 400)
  no captcha token — not-enforced (HTTP 400)

Login captcha is NOT ENFORCED: ...
```

Exit code 1. **This is the expected result at this point and is not a failure of the task** — it is the baseline the runbook compares against, and it proves the script can tell the two states apart. Record the output; it goes in the pull request description.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-captcha-live.mjs src/security/captchaLiveCheck.test.ts package.json
git commit -m "feat(scripts): add check:captcha to prove captcha enforcement

Nothing in the app can tell you whether Supabase actually verifies the
Turnstile token -- with CAPTCHA protection off it accepts, ignores and
discards it, and the code reads identically either way.

GoTrue runs captcha verification before the credential check, so a
deliberately wrong password reveals which ran first: 'captcha protection:
request disallowed' means enforced, 'Invalid login credentials' means it
was never consulted.

Probes the password grant only, with a nonsense .invalid address that can
match no account and send no mail. Never the OTP endpoint -- unenforced,
that sends a real SMS at real cost. Verdict is three-state so an
unrecognised response says so rather than picking the reassuring answer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Correct the documentation and write the owner runbook

Every item here currently asserts protection that does not exist, and each one discourages the next person from checking. The runbook is what makes the owner action repeatable and reversible.

**Files:**
- Modify: `src/supabase/hooks/useCustomerAuth.ts` — the docblock above `signInWithPassword` (around line 365-371)
- Modify: `.env.example` — the Turnstile block (lines 30-34)
- Modify: `README.md` — the external services list (around line 96)
- Modify: `docs/architecture/overview.md` — the external services list (around line 186)
- Create: `docs/superpowers/runbooks/2026-09-11-login-captcha-enablement.md`

**Interfaces:**
- Consumes: the `npm run check:captcha` script name from Task 4.
- Produces: nothing other tasks import.

- [ ] **Step 1: Fix the wrong comment in useCustomerAuth.ts**

Replace:

```ts
   * Sign in a returning customer with phone + password. The phone was
   * set by checkPhone. captchaToken is required when project-wide captcha
   * protection is on (it is, for OTP) — Supabase rejects the call without
   * it. On success the SIGNED_IN event links the human record via
   * applySession; on failure we show a deliberately generic error.
```

with:

```ts
   * Sign in a returning customer with phone + password. The phone was
   * set by checkPhone. captchaToken is required when project-wide captcha
   * protection is on under Authentication -> Attack Protection — Supabase
   * rejects the call without it, and ignores it entirely when the setting is
   * off. Do not assert the current state here; run `npm run check:captcha`,
   * which probes the live project. On success the SIGNED_IN event links the
   * human record via applySession; on failure we show a deliberately generic
   * error.
```

- [ ] **Step 2: Fix `.env.example`**

Replace the Turnstile block:

```
# Cloudflare Turnstile site key — shown in the login widget.
# Create a site at dash.cloudflare.com → Turnstile → Add site.
# The matching *secret* key goes into Supabase Auth settings (not here).
# Fallback in code: Cloudflare's always-passes test key (dev only).
VITE_TURNSTILE_SITE_KEY=your-turnstile-site-key-here
```

with:

```
# Cloudflare Turnstile site key — shown in the login widget. Public; safe here.
# Create a site at dash.cloudflare.com → Turnstile → Add site.
# The matching *secret* key goes into Supabase Auth settings (never this file).
#
# Leave it unset in DEV and the app falls back to Cloudflare's always-passes
# test key, with a warning. Leave it unset in a PRODUCTION build and sign-in is
# BLOCKED on both login pages — a captcha that always passes is worse than
# none, so the app refuses rather than pretending. Setting the test key
# explicitly in production is blocked for the same reason.
VITE_TURNSTILE_SITE_KEY=your-turnstile-site-key-here
```

- [ ] **Step 3: Add the verification pointer to README.md**

Replace, in the external services list:

```
  postcode lookup), Cloudflare Turnstile (login CAPTCHA), Sentry (error reporting —
```

with:

```
  postcode lookup), Cloudflare Turnstile (login CAPTCHA — enforcement depends on
  Supabase Authentication → Attack Protection being on; `npm run check:captcha`
  verifies it against the live project), Sentry (error reporting —
```

- [ ] **Step 4: Add the same pointer to docs/architecture/overview.md**

Replace:

```
- Cloudflare Turnstile for login abuse protection;
```

with:

```
- Cloudflare Turnstile for login abuse protection — the widget alone proves
  nothing, because Supabase only calls Cloudflare's siteverify endpoint when
  CAPTCHA protection is enabled; `npm run check:captcha` probes the live
  project and says which state it is in;
```

- [ ] **Step 5: Write the runbook**

Create `docs/superpowers/runbooks/2026-09-11-login-captcha-enablement.md`:

```markdown
# Enabling login CAPTCHA verification

**Owner action.** Needs the Turnstile widget's **secret** key, which must never
enter this repository. Takes about five minutes. Reversible in one click.

## Why

Until this is switched on, the Turnstile widget on both login pages issues a
challenge, the visitor solves it, and Supabase accepts the token without
checking it. The widget is real; the verification is not.

Background and the decision to enable rather than remove:
`docs/superpowers/specs/2026-09-11-turnstile-verification-design.md`.

## Before you start

The code-side work must already be deployed to production. Confirm the staff
and customer login pages both show a working challenge — if they show
"Sign-in is unavailable right now", `VITE_TURNSTILE_SITE_KEY` is missing from
Vercel and must be fixed **before** going any further.

Take the baseline:

```bash
npm run check:captcha
```

Expect `NOT ENFORCED`. If it already says `ENFORCED`, stop — someone has
enabled it and this runbook does not apply.

## Steps

1. In the Cloudflare dashboard, open Turnstile → the "Customer Log-in Capture"
   widget (site key `0x4AAAAAADMvAmN7LsBYiIqZ`) → **Settings**, and copy the
   **secret** key. Do not paste it into this repository, a commit message, a
   chat, or an issue.
2. In the Supabase dashboard, open **Authentication → Attack Protection**.
3. Enable **CAPTCHA protection**, choose provider **Turnstile by Cloudflare**,
   paste the secret key, and save.

## Verify

Three checks, all three required.

1. Enforcement:

   ```bash
   npm run check:captcha
   ```

   Expect `ENFORCED` on both probes and exit code 0.

2. Real sign-ins. Sign in on the staff page and on the customer page. A
   verified captcha with broken login is a worse outcome than where we started,
   so do not skip this.

3. Cloudflare analytics. The widget's siteverify count moves off zero and the
   dashboard warning about siteverify not being called clears. The count should
   track solved challenges from here on.

## Rollback

Turn CAPTCHA protection back off in Supabase → Authentication → Attack
Protection. It takes effect immediately and needs no deploy.

The application code is correct either way and does not need reverting — with
the setting off, the widget simply goes back to being decorative, which is the
state this work was undertaken to end.

## If sign-in breaks after enabling

Most likely causes, in order:

- **The secret key does not match the site key.** A token minted by one widget
  fails siteverify against another's secret. Check the pair in Cloudflare.
- **`VITE_TURNSTILE_SITE_KEY` in Vercel is Cloudflare's test key.** A test-key
  token can never pass a real secret. The login pages refuse to render at all
  in this state, so you would see the unavailable message rather than a failed
  sign-in.
- **Cloudflare's challenge script is blocked** for that visitor, so no token is
  ever produced. Inherent to any captcha; roll back if it is widespread.
```

- [ ] **Step 6: Verify the docs check passes**

```bash
npm run check:docs
```

Expected: `Documentation links and heading anchors OK (N governed Markdown files)` with N one higher than before.

- [ ] **Step 7: Commit**

```bash
git add src/supabase/hooks/useCustomerAuth.ts .env.example README.md docs/architecture/overview.md docs/superpowers/runbooks/2026-09-11-login-captcha-enablement.md
git commit -m "docs: stop claiming captcha protection that is not enabled

useCustomerAuth.ts stated that project-wide captcha protection 'is' on
for OTP. It is not, and a confidently wrong comment is what stops the
next person checking. It now describes the dependency and points at
check:captcha rather than asserting a state.

README and the architecture overview described Turnstile as login
protection with no way to tell whether it was live; both now name the
Supabase setting it depends on and the command that verifies it.

.env.example said the test-key fallback was 'dev only' without saying
what happened if it reached production. It now says sign-in is blocked.

Adds the owner runbook for enabling the setting: where the secret key
comes from, the three verification steps, and the one-click rollback.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Full CI bar and pull request

**Files:** none modified — this is the gate.

- [ ] **Step 1: Run the complete CI bar**

```bash
npm run lint && npm run check:docs && npm run typecheck && npm run check:migrations && npm run test && npm run build
```

Expected: all six pass. Notes on the likely stumbles:

- `check-lockfile-platform` failing means `npm install` was run on macOS and stripped Linux `libc` metadata. Fix with `git restore package-lock.json`.
- Around six directory component tests fail locally only, from `localStorage` isolation. They are pre-existing and unrelated; confirm they fail on `main` too before chasing them.
- No migrations are added by this work, so `check:migrations` is a no-op pass.

- [ ] **Step 2: Run the E2E login specs**

The `forceOffline` short-circuit in Task 1 exists specifically so these keep passing. Prove it:

```bash
npm run e2e -- --grep -i login
```

Expected: PASS. A failure here means the offline carve-out is wrong — the E2E build is a production build with no site key, and without the carve-out every login page fails closed.

- [ ] **Step 3: Push and open the pull request**

```bash
git push -u origin HEAD
```

The pull request description must include:

- the `npm run check:captcha` **NOT ENFORCED** baseline output from Task 4 Step 6, verbatim;
- an explicit note that **this pull request changes nothing in production until the owner enables the Supabase setting** — with `VITE_TURNSTILE_SITE_KEY` already set in Vercel, behaviour is identical before and after the merge;
- a link to `docs/superpowers/runbooks/2026-09-11-login-captcha-enablement.md` as the next step, and that it is the owner's to run;
- the deferred Edge Function verification, with its reason (Turnstile tokens are single-use, and the customer flow carries one token from the `checkPhone` pre-flight into the follow-up auth call, so verifying there would consume it and break login), to be raised as its own issue.

End the description with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
