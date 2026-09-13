# Turnstile verification — design

**Date:** 11 September 2026
**Status:** approved, not yet implemented
**Decision:** make the captcha real (Supabase verifies it), do not remove the widget

## The problem

The Cloudflare Turnstile widget on both login pages issues a challenge, the
visitor solves it, and the resulting token is passed to Supabase as
`options.captchaToken`. Supabase never checks it.

Supabase only calls Cloudflare's `siteverify` endpoint when CAPTCHA protection
is enabled under Authentication → Attack Protection. It is not enabled on the
production project, so the token is accepted, ignored and discarded.

Two independent pieces of evidence agree:

1. The widget ("Customer Log-in Capture") reports **0 siteverify requests**
   against 5 solved challenges in 24 hours, and Cloudflare shows a warning on
   the widget saying siteverify is not being called.
2. A direct probe of the production auth endpoint on 11 September 2026:

   ```
   POST /auth/v1/token?grant_type=password  + invalid captcha token → invalid_credentials
   POST /auth/v1/token?grant_type=password  + no captcha token      → invalid_credentials
   ```

   Both reached the password check. With CAPTCHA protection on, both would have
   been refused up front with `captcha protection: request disallowed`.

`grep -rn "siteverify" supabase/functions` returns nothing, so no Edge Function
verifies it either.

This is worse than having no captcha. The widget tells visitors they are
passing a security check, the README describes Turnstile as "login CAPTCHA",
the architecture overview lists it under "login abuse protection", and a code
comment in `src/supabase/hooks/useCustomerAuth.ts` states that captcha
protection "is" on for OTP. Every one of those is currently false, and each one
discourages the next person from checking.

### What is actually exposed

The interesting endpoint is not staff login, it is SMS.

`sendOtp` calls `supabase.auth.signInWithOtp({ phone })` directly from the
browser. There is no Edge Function in front of it, so nothing but Supabase's
default rate limit stands between an automated caller and the Twilio bill.
OTP endpoints are the standard target for SMS pumping and toll fraud, and every
message is a real cost to the salon.

By contrast `customer-phone-on-file` — the phone enumeration endpoint — is
already well defended, with a two-tier fixed-window rate limit (per-IP and
global) and a uniform response shape for known and unknown numbers. It is the
one pre-auth endpoint that does not cost money per request.

So the ordering is: enabling Supabase's own verification protects the endpoints
that matter (OTP send, password sign-in, password recovery). Edge-Function-side
verification would protect the endpoint that is already protected.

### Why not remove it instead

Removing the widget is the correct answer only if bot protection on login is
unwanted. It is not: the salon pays per SMS, and the UI, the token plumbing and
the widget already work. Removing them would be effort spent to end up with
less protection than we have today. Enabling verification is one dashboard
toggle plus the code work below that makes flipping it safe.

## Scope

**In scope**

- A site-key resolver that fails closed in production instead of silently
  falling back to Cloudflare's always-passes test key.
- Blocking sign-in, with an honest message, when the resolver reports a
  configuration error.
- Missing-token guards on the staff login page, so enabling the toggle does not
  produce confusing errors.
- A repeatable `npm run check:captcha` that proves whether verification is
  actually enforced in production.
- Correcting the documentation and comments that currently assert protection
  that does not exist.
- A runbook for the owner action (enabling CAPTCHA in Supabase) with its
  verification steps and rollback.

**Out of scope**

- Enabling CAPTCHA in the Supabase dashboard. That requires the widget's secret
  key and is an owner action; this work prepares for it and verifies it
  afterwards.
- Verifying Turnstile inside the `customer-phone-on-file` Edge Function. See
  "Deferred" below.
- Any change to the domain cutover. This is independent of it and is tested
  separately.

### Deferred: Edge Function verification

The legal-risk remediation design of 12 July 2026 required that "Turnstile is
verified by the Edge Function, not only by React". That was specified and never
built, and it cannot simply be bolted on now.

Turnstile tokens are single-use. The customer login flow deliberately carries
one token from the `checkPhone` pre-flight through to the follow-up password or
OTP call, which is why `CustomerLoginPage.jsx` comments that "the pre-flight
didn't consume it". Calling `siteverify` inside `customer-phone-on-file` would
consume that token, and the follow-up auth call would then fail with an
already-redeemed token.

Doing it properly means a second challenge round between the two stages: reset
the widget after `checkPhone`, wait for a fresh token, then authenticate. That
is a real change to the customer login experience and deserves its own design,
its own testing and its own decision about whether the extra friction is worth
protecting an endpoint that already has two-tier rate limiting.

Raised as a separate issue. Not smuggled into this change.

## Design

### 1. Site key resolver

New module `src/lib/turnstile.ts`, deliberately mirroring the
`supabaseConfigError` shape already established in `src/supabase/client.ts`,
because that is this repository's existing idiom for "this deploy is
misconfigured".

The resolution is a pure function taking its environment as an argument, with a
thin module-level binding reading `import.meta.env` on top. That makes the
truth table testable without rebuilding the app, the same way
`classifySentryChunk` is testable without a network round trip.

```
resolveTurnstileConfig({ siteKey, forceOffline, isProduction })
  → { siteKey: string | null, configError: string | null, usingTestKey: boolean }
```

Rules, in order:

| Condition | Result |
| --- | --- |
| `forceOffline` | test key, no error — nothing real is being protected |
| a real site key is configured | that key |
| missing, or explicitly the test key, **and** production | `configError`, site key `null` |
| missing, or explicitly the test key, in dev | test key, plus a loud `logger.warn` |

Three details that matter:

- **An empty string counts as missing.** Today's `??` only catches `undefined`,
  so `VITE_TURNSTILE_SITE_KEY=` in an env file passes an empty string straight
  into the widget and renders a broken one. The resolver trims and treats blank
  as absent.
- **Explicitly setting the test key in a production build is also a config
  error.** Otherwise the fail-closed rule has an obvious loophole that spells
  itself out in an env file and looks deliberate.
- **`forceOffline` is checked first.** This is not a nicety. E2E runs
  `npm run build` — so `import.meta.env.PROD` is true — with
  `VITE_FORCE_OFFLINE=1` and no Turnstile key. Without this carve-out every
  login spec would fail closed. `src/supabase/client.ts` short-circuits on
  `forceOffline` in exactly the same way and for exactly the same reason.

### 2. Failing closed at the login pages

When `configError` is set, neither login page renders a Turnstile widget. Each
shows a calm unavailable state in place of the security-check panel, disables
the submit control, and fires `logger.error` once so the problem reaches Sentry
(live in production since 28 August 2026).

This is an improvement even if the Supabase toggle is never flipped. With a
real secret key configured in Supabase, a token minted by the test site key
fails `siteverify` anyway — so today's fallback does not degrade gracefully, it
just produces a baffling error instead of an honest one.

The gate is local to the login pages, not global like `supabaseConfigError`.
A missing captcha key has no bearing on a staff member who already holds a
session, and locking the whole application would be a disproportionate
response to a problem that only affects authentication.

Copy follows the established on-screen voice — warm and calm, saying plainly
what is wrong and what happens next, without alarming a customer who only
wanted to book a groom.

### 3. Missing-token guards on the staff login page

This is the part that makes the toggle safe to flip.

`CustomerLoginPage` already blocks submission when the widget has not yet
resolved, showing `CAPTCHA_PENDING_ERROR`. `LoginPage` does not — neither on
sign-in nor on password reset. Both currently omit the option entirely when the
ref is empty:

```js
...(captchaToken ? { options: { captchaToken } } : {})
```

Once CAPTCHA protection is on, a staff member who submits before the widget
settles gets a raw `captcha protection: request disallowed` from Supabase
rather than anything actionable. The fix is the same guard the customer page
already has, applied to both staff paths.

### 4. `npm run check:captcha`

A new `scripts/check-captcha-live.mjs`, built on the `check-sentry-live.mjs`
idiom. This repository already treats "is this control actually live in
production?" as a repeatable script rather than a dashboard screenshot, and
this is the same class of question that script was written to answer.

Two probes against the deployed project's token endpoint:

- one carrying a deliberately invalid captcha token,
- one carrying no captcha token at all.

Classification is three-state, because guessing is what got us here:

| Response | Verdict |
| --- | --- |
| `msg` contains `captcha protection` | **ENFORCED** |
| `error_code` is `invalid_credentials` | **NOT ENFORCED** |
| anything else | **UNKNOWN** — print the raw payload, exit non-zero |

Both probes must come back enforced for the script to pass. The classifier is
exported as a pure function and tested in `src/security/captchaLiveCheck.test.ts`,
matching `src/security/sentryLiveCheck.test.ts`.

**Where it gets its target.** The Supabase project URL and publishable key,
both of which are public values that already ship in the browser bundle. Read
from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (falling back to
`VITE_SUPABASE_ANON_KEY`, as the client does), overridable with `--url` and
`--key` flags so the script can be pointed at staging.

**Not part of the CI bar.** Like `check:sentry`, this needs the network and a
live project, so it is run deliberately rather than on every push. CI stays
`lint → check:docs → typecheck → check-migrations → test → build`.

**Safety constraints on the probe.** It uses a nonsense address in the reserved
`.invalid` TLD, so it cannot match a real account and cannot cause mail to be
sent. It sends no real credentials and writes nothing.

The script probes the **password grant only**. It must never probe
`/auth/v1/otp`: if captcha is not enforced, that endpoint sends a real SMS, at
real cost, potentially to a real person. The password grant shares the same
captcha middleware, so it answers the same question for free. This constraint
is written into the script as a comment, not just here.

### 5. Documentation and the stale comments

Each of these currently asserts protection that does not exist:

- `src/supabase/hooks/useCustomerAuth.ts` — states captcha protection "is" on
  for OTP. It is not. This becomes true after the toggle, but the comment should
  describe the dependency rather than assert the state.
- Both login page headers — explain the test-key fallback as though it were a
  supported production path.
- `.env.example` — says the fallback is "dev only" without saying what happens
  when the variable is missing from a production build.
- `README.md` and `docs/architecture/overview.md` — describe Turnstile as login
  CAPTCHA / login abuse protection, with no pointer to how that claim is
  verified. They gain a `npm run check:captcha` reference alongside the existing
  `npm run check:sentry` one, since that pairing is the point.

Plus a runbook under `docs/superpowers/runbooks/` for the owner action: where
the secret key comes from, where it goes, the two verification steps, and how
to roll back.

## Verification

Enabling the toggle is only finished when it is evidenced. Three checks, in
this order:

1. **Before the toggle** — `npm run check:captcha` reports NOT ENFORCED. This
   establishes the baseline and proves the script can tell the difference.
2. **After the toggle** — `npm run check:captcha` reports ENFORCED on both
   probes. An invalid token and a missing token are refused.
3. **Cloudflare analytics** — the widget's siteverify count moves off zero and
   the dashboard warning clears. This is the owner's to confirm; the count
   should track solved challenges.

A real sign-in on each login page, staff and customer, after the toggle.
Verification working but login broken is a worse outcome than where we started.

## Rollout

The code lands first. For almost everyone its behaviour is unchanged until the
toggle is flipped — but not for everyone, and the exception matters. The
missing-token guards in §3 are client-side and unconditional: they do not consult
the Supabase setting. So a visitor whose browser cannot load
`challenges.cloudflare.com` — an extension, a corporate filter, a blocked region
— can sign in today, because the token is optional and Supabase ignores it, and
cannot sign in once this merges, toggle untouched. That is the intended trade
(a captcha nobody can solve should not be waved through), but it is a deploy-time
behaviour change, not a toggle-time one, and must not be described as harmless.

**Before merging, confirm `VITE_TURNSTILE_SITE_KEY` is present in the Vercel
Production environment.** Merging to `main` auto-deploys, and fail-closed means a
missing variable there locks both login pages for everyone until it is restored
and redeployed. This repository has already shipped one `VITE_` name that was
assumed present on Vercel and was not.

The toggle is the owner action, taken after the code is deployed, following the
runbook.

Rollback is turning CAPTCHA protection back off in the Supabase dashboard. It
takes effect immediately and needs no deploy. The code stays; it is correct
either way.

Independent of the domain cutover, and tested separately from it.

## Risks

**Staff lockout if the env var goes missing.** Failing closed means that if
`VITE_TURNSTILE_SITE_KEY` is ever removed from Vercel, staff cannot sign in
until it is restored and redeployed. This is the deliberate cost of not having a
control that silently disables itself. It is mitigated by the error naming the
exact missing variable, by `logger.error` reaching Sentry, and by the fix being
a one-line env change. It can only arise if someone removes a variable that is
currently set.

Failing open for staff and closed for customers was considered and rejected.
Staff accounts are the higher-value target, and a rule that differs by page is
the kind of inconsistency that rots quietly — which is the failure mode this
whole change exists to correct.

**The toggle changes production auth behaviour.** Every login path starts
requiring a valid token at the moment it is flipped. This is why the guards in
§3 land first, why the runbook has a rollback, and why the toggle is a
deliberate separate step rather than something that rides along with a merge.

**Turnstile itself can fail, and the toggle does not undo it.** If Cloudflare's
challenge script is blocked or unreachable, the widget never produces a token and
that visitor cannot sign in. This is inherent to any captcha and is accepted — but
be precise about the remedy: because the client-side guards are unconditional,
turning the Supabase setting back off does **not** help this visitor. The toggle
reverses server-side enforcement only. Restoring access for someone whose browser
blocks the challenge script requires a code revert and a deploy, not a dashboard
click. Anywhere this document or the runbook offers rollback as the mitigation for
a *blocked-script* failure, it is wrong; rollback is the mitigation for
*enforcement* failures.

## Testing

- `src/lib/turnstile.test.ts` — the resolver truth table: configured key wins,
  blank string treated as missing, explicit test key in production is an error,
  production plus missing is an error, dev plus missing yields the test key,
  `forceOffline` short-circuits ahead of all of it.
- `src/security/captchaLiveCheck.test.ts` — the classifier, over each response
  shape including the unknown case.
- Component tests on both login pages — submit is blocked and the unavailable
  state renders when `configError` is set; staff sign-in and password reset are
  both blocked while no token is present.

Full CI bar before the pull request: `lint`, `check:docs`, `typecheck`,
`check:migrations`, `test`, `build`.
