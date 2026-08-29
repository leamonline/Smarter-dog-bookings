# Browser error reporting (Sentry)

**Status as of 28 August 2026: LIVE in production.** `VITE_SENTRY_DSN` is set,
the build carries the SDK, and `npm run check:sentry` reports `ACTIVE` — the
deployed chunk is 86,201 bytes, matching a local DSN-set build byte for byte.

It had never sent an event before this. The section below is kept because the
detection method is what makes the claim checkable rather than assumed, and
because the same silence returns the moment the variable is removed or a build
ships without it.

## Why this file exists

The app cannot tell you whether reporting works. [`initSentry()`](../src/lib/sentry.js)
returns early when `VITE_SENTRY_DSN` is absent, and `captureException` returns
early when init did not run. So with no DSN every one of the ~159 `logger.error`
and `logger.warn` call sites across ~71 files is a silent no-op, and the source
reads exactly the same either way.

That state held unnoticed from the logger's introduction until 27 August 2026,
when a change adding reporting to the booking wizard's failure path
([#706](https://github.com/leamonline/Smarter-dog-bookings/pull/706)) prompted the
question "does this actually report anywhere?". It did not.

## How to tell, in one command

```bash
npm run check:sentry                       # production
npm run check:sentry -- https://some.url   # any deployed origin
```

It reports `ACTIVE` or `INACTIVE` and exits `0` or `1`. It exits `2` and says so
when it could not read a build at all.

**It needs an origin it can read unauthenticated.** Vercel preview deployments
sit behind deployment protection and answer `/sw.js` with a redirect to an SSO
page, so the check reports the access problem rather than a verdict. Point it at
production, or at a preview with protection disabled.

The check reads the deployed artefact rather than a configuration screen,
because the failure most worth catching is a variable that was set but never
redeployed.

**The signal.** Vite inlines `import.meta.env.VITE_SENTRY_DSN` at build time.
With no DSN it becomes `undefined`, so `if (!dsn) return` is statically true,
`Sentry.init` is unreachable, and Rollup tree-shakes the whole `@sentry/react`
namespace import away. [`vite.config.js`](../vite.config.js) routes
`node_modules/@sentry/**` into its own chunk, so "was a DSN present at build
time?" becomes "does the deployed sentry chunk still contain the SDK?".

Measured on this repository, the difference has no middle ground:

| build | sentry chunk | size |
|---|---|---|
| without `VITE_SENTRY_DSN` | `sentry-DKgiNFpY.js` | **36 bytes** — one `import` line |
| with `VITE_SENTRY_DSN` | `sentry-jiJgjQ7Y.js` | **86,201 bytes** |

The check is **not** wired into CI: CI builds carry no DSN by design, so it
would always report inactive there. It asks about a *deploy*.

## Enabling it

1. Create (or pick) a Sentry project of platform **React**, and copy its DSN.
   A DSN is not a secret — it ships in the browser bundle — but it is still
   account configuration and belongs in Vercel, never in the repository.
2. In the Vercel project, add `VITE_SENTRY_DSN` for the **Production**
   environment (and Preview, if preview errors are wanted). Optionally set
   `VITE_SENTRY_ENVIRONMENT`; it defaults to `import.meta.env.MODE`, which is
   `production` on a Vercel production build.
3. **Redeploy.** `VITE_` variables are inlined at build time, so an existing
   deployment does not pick up a newly-set variable.
4. Verify with `npm run check:sentry`. It must report `ACTIVE`.

Never put the DSN in `.env` in the repository, and never give a `VITE_`
variable a service-role or provider secret — anything `VITE_` prefixed is
visible to every browser that loads the app.

## What gets sent, and what does not

[`sentryBeforeSend`](../src/lib/sentry.js) runs on every event before it
leaves the browser. [`docs/interface-capability-truth.md`](interface-capability-truth.md)
describes the two redaction passes in full. In short:

- **By pattern**, anywhere in the event: UK phone numbers, email addresses, UK
  postcodes, bearer tokens and UUIDs.
- **By key**, in structured data: names, addresses, notes, social handles and
  message content.
- Tags are never redacted, so the `component` and `op` tags that call sites set
  still identify where a failure happened.

`Sentry.init` also sets `sendDefaultPii: false` and `tracesSampleRate: 0` — no
performance tracing, so enabling this sends errors only.

**This redaction ran for the first time on 28 August 2026.** Until then it had
never executed against real traffic — it was correct by construction and by
unit test, which is not the same as proven. Treat the first week as a review
period: confirm events are arriving, then read a sample and check the pattern
pass (phone, email, postcode, token, UUID) and the key pass (names, addresses,
notes, message content) actually fire on real payloads. Report anything that
leaks rather than assuming the tests covered it.

## Related

- [`src/lib/logger.ts`](../src/lib/logger.ts) — the call-site API; `error()` forwards here
- [`src/lib/sentry.js`](../src/lib/sentry.js) — init, redaction and the DSN gate
- [`docs/interface-capability-truth.md`](interface-capability-truth.md) — the redaction contract in detail
- [`.env.example`](../.env.example) — the variable names
