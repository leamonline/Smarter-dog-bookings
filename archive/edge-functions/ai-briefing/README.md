# ai-briefing (archived edge function)

Recovered from production (Supabase project `nlzhllhkigmsvrzduefz`, deployed
version 19) and archived here on 2026-06-08, just before deleting the live
function. `index.ts` is byte-for-byte what was running in prod.

## What it was
A tiny store/fetch API for a daily "briefing":
- `POST` (auth `Bearer ${BRIEFING_SECRET}`) upserted a briefing into the
  `public.briefings` table — driven by a Make.com scenario.
- `GET` (no auth) returned the latest briefing — read by an Apple Shortcut.

## Why it was pruned
- The source had never been committed to this repo — only the hand-deployed
  prod copy existed.
- Dead: the Make.com scenario is gone, nothing triggers it, `public.briefings`
  had 0 rows, and it logged 0 invocations.
- Security: `BRIEFING_SECRET` fell back to `'change-me'`, and the `GET` was
  unauthenticated while using the service-role key — bypassing the deliberately
  locked-down `briefings` RLS. Deleting it closes that exposure path.

Kept here for reference only. It lives OUTSIDE `supabase/functions/`, so CI will
never deploy it. The `public.briefings` table was left in place (empty,
RLS-locked) — drop it separately if you want it gone too.
