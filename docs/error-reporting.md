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

## Releases and readable stack traces

Production errors are tagged with the commit that built the bundle (`release`), and the build uploads
that commit's source maps to Sentry, so a stack trace names real files and lines instead of minified
chunks. Events also carry a `mount` tag (`staff`, `customer`, …), which is the entrance, not customer data.

It switches on only when the Vercel **Production** environment holds `SENTRY_AUTH_TOKEN` (sensitive),
`SENTRY_ORG` and `SENTRY_PROJECT`. Without any one of them (previews, local builds, CI, E2E) nothing
changes: no maps are generated and there is no network call. The logic is in
[`vite.sentry.js`](../vite.sentry.js) and is covered by `src/test/sentryBuild.test.js`.

- **Visitors never receive a `.map` file.** Maps are generated `hidden` (no `sourceMappingURL` in any
  bundle), uploaded, then deleted from `dist/`. The deletion runs even if the upload fails.
- **Sentry being down never fails a deploy.** An upload error is a build-log warning
  (`[sentry] source map upload did not complete`), and that deploy's errors simply stay minified.
- **Never prefix the token `VITE_`.** That would ship it to every browser.
- To prove it works after a deploy: trigger one deliberate test error on production and confirm the
  event in Sentry shows source file names and the commit as its release.

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

## Stale deploys and missing chunks

After a deploy, a tab that is already open still has the previous JavaScript in
memory. The next screen it lazy-loads asks for a hashed file that the new
deploy deleted. Two things used to follow:

- Vercel's marketing catch-all rewrote that missing `/app/assets/*.js` (and the
  marketing site's `/assets/*.js`) to `index.html` with HTTP 200. The browser
  then refused to run it (`text/html` is not a JavaScript MIME type, or
  "Failed to fetch dynamically imported module") and the screen went blank.
- [`installChunkReloadHandler`](../src/lib/chunkReload.js) did reload once, but
  it stored the guard before the navigation finished. A second event from the
  same failure — another chunk, or the `vite:preloadError` that follows the
  first — was reported as `chunkReload: loop_guard_hit` and was not swallowed.
  The recovering reload itself was sent to Sentry at info level, which still
  opens an issue (JAVASCRIPT-REACT-A, JAVASCRIPT-REACT-8).

The catch-all now excludes `/assets/` and `/app/assets/`. A file that exists is
still served from the filesystem before rewrites, so real chunks, CSS and the
booking routes (`/staff`, `/book`, `/reset-password`) are unchanged. A missing
hash 404s. The header that marks `/app/assets/*` immutable still applies to that
404; a retired content hash never comes back, so caching the 404 is safe.

The handler navigates once, with `location.replace` onto the same URL plus a
`__sd_chunk_reload` timestamp that it strips on the next document. A second
event on the way out does not count as a failed recovery. A failure on the
fresh document within 10 seconds does: the loop guard reports that one to
Sentry and the existing "this part didn't load" screen stays up, with a button
that asks for another refresh. Handled reloads are not sent. Sentry's
`beforeSend` also drops the lazy-import shadow (`undefined is not an object
(evaluating 'e.Analytics')`) while a reload is in flight, and keeps every other
error.

Customer drafts saved with `useDraftPersistence` live in `localStorage` and come
back after the refresh. The staff new-booking drawer and unsaved settings edits
are React state, so they do not. The screen says so ("Anything you had not
saved may need to be entered again") instead of refreshing with no explanation.
The marketing site has no equivalent handler; a missing `/assets/*.js` there
now 404s and still needs a manual refresh.

## Related

- [`src/lib/logger.ts`](../src/lib/logger.ts) — the call-site API; `error()` forwards here
- [`src/lib/sentry.js`](../src/lib/sentry.js) — init, redaction and the DSN gate
- [`docs/interface-capability-truth.md`](interface-capability-truth.md) — the redaction contract in detail
- [`.env.example`](../.env.example) — the variable names
