# smarterdog.co.uk domain cutover runbook

**Status:** In progress — step 2 (Vercel domains) done 11 September 2026; DNS not yet changed.
**Issue:** [#824](https://github.com/leamonline/Smarter-dog-bookings/issues/824)
**Plan:** [single-domain routing](../../plans/active/2026-09-10-smarterdog-domain-routing.md)
**Pull request:** [#825](https://github.com/leamonline/Smarter-dog-bookings/pull/825)

Points smarterdog.co.uk at Vercel, so one deployment serves the marketing site
at `/`, customers at `/book` and staff at `/stafflogin`. Every step below
changes an external account and therefore needs explicit owner authority —
preparing this runbook is not that authority.

**Do it on a closed day.** The salon opens Mon–Wed, so Thursday morning gives
the longest window before anyone needs to book or groom.

## Invariants

- **Nameservers and MX never change.** They stay at Bluehost. Email is
  `box4089.bluehost.com`; touching NS or MX takes the salon's email down. Only
  the apex `A` record and the `www` record change.
- **Bluehost `public_html/` is left untouched**, so rollback is a DNS change
  and nothing else.
- Exactly one publisher writes to Bluehost. Disable it before the DNS change,
  not after.

## Current state (verified 11 September 2026)

| What | Value |
| --- | --- |
| apex `A` | `50.6.153.109` (Bluehost) |
| `www` | `103.169.142.0` — a different server, and already broken |
| nameservers | `ns1.bluehost.com`, `ns2.bluehost.com` |
| MX | `box4089.bluehost.com` |
| Vercel team / project | `smarterdog` / `smarter-dogs-smart-humans` |
| Vercel custom domains | none yet — only `*.vercel.app` |
| Supabase prod project | `nlzhllhkigmsvrzduefz` (Smarter-dog-grooming, eu-west-2) |

`www` failing is pre-existing, not caused by this work: it points at a
different host from the apex, serves no certificate valid for that name, and
returns `409` over plain HTTP. Adding it to Vercel fixes it as a side effect.

## 1. Merge the code — AUTHORISE

Merge #825. Nothing about the live domain changes: smarterdog.co.uk still
resolves to Bluehost. What changes is that `smarterdog.vercel.app` starts
serving the marketing site at `/` and the booking app at `/book` and `/staff`.

Check on `smarterdog.vercel.app` before going further: `/` is the marketing
site, `/stafflogin` reaches the staff sign-in, `/book` reaches the customer
login, and an old bookmark like `/today` still lands on the app.

## 2. Add the domains in Vercel — ✅ DONE 11 September 2026

Both are attached to `smarter-dogs-smart-humans` under the `smarterdog` team:

- `smarterdog.co.uk`
- `www.smarterdog.co.uk`

Both report "not configured properly", which is expected and harmless — the
domain still resolves to Bluehost and the live site is unaffected until step 7.

**The records Vercel asked for (read back from `vercel domains inspect`):**

| Record | Name | Value |
| --- | --- | --- |
| `A` | `smarterdog.co.uk` | `76.76.21.21` |
| `A` | `www.smarterdog.co.uk` | `76.76.21.21` |

Vercel offers a second option — pointing the nameservers at
`ns1.vercel-dns.com` / `ns2.vercel-dns.com`. **Do not take it.** That moves the
whole zone to Vercel, taking the MX records with it, and the salon's email
stops. The `A`-record option keeps DNS at Bluehost where the mail config lives.

Re-read the values before using them if much time has passed:

```bash
vercel domains inspect smarterdog.co.uk --scope smarterdog
```

If the apex should be the primary and `www` should redirect to it, set that in
Settings → Domains; it matches how the site is linked today.

## 3. Supabase Auth — ✅ redirect URLs DONE 11 September 2026 (Site URL still pending, step 7)

Dashboard → project `nlzhllhkigmsvrzduefz` → Authentication → URL Configuration.

**Redirect URLs — done.** Both are present, and the 17 entries verified on
screen:

- `https://smarterdog.co.uk/**`
- `https://www.smarterdog.co.uk/**`

Every existing `vercel.app` entry was kept, as the compatibility window needs
them.

**`http://smarterdog.co.uk/book/reset-password` was removed.** It had been
added in good faith and matched nothing: the scheme is
`http` where the site serves `https`, and the path is `/book/reset-password`
where the app actually uses `/reset-password`. Supabase matches scheme, host
and path, so a near-miss entry is the same as no entry — which is the trap this
step exists to avoid.

The real URL is `https://smarterdog.co.uk/reset-password`, because both callers
build it as `` `${window.location.origin}/reset-password` `` — see
[LoginPage.jsx](../../../src/components/auth/LoginPage.jsx#L115) and
[AccountSettings.jsx](../../../src/components/views/settings/AccountSettings.jsx#L67)
— and `/reset-password` is a root route with its own mount, not one under
`/book` ([entrypoints.ts](../../../src/routing/entrypoints.ts#L74)). The `/**`
wildcards above cover it without naming it.

**Site URL — still to do, at the DNS switch (step 7).** It is currently
`https://smarter-dogs-smart-humans-smarterdog.vercel.app/`, which works today.
Supabase uses it as the fallback redirect and as `{{ .SiteURL }}` in email
templates, so pointing it at `smarterdog.co.uk` before DNS moves would put dead
links in any email sent in between. Change it to `https://smarterdog.co.uk`
once the records are live.

## 4. Turnstile — AUTHORISE

**The widget is not in the Cloudflare account you land in by default.** The
account reached from `dash.cloudflare.com` as `leam@leamonline.uk` shows *no*
Turnstile widgets at all, which reads like Turnstile was never set up. It was —
in a second account.

| | |
| --- | --- |
| Account | `0ecd5c4d05ee426d5c33874d6a64d6d1` |
| Widget | **Customer Log-in Capture** |
| Site key | `0x4AAAAAADMvAmN7LsBYiIqZ` (public — it ships in the browser bundle) |
| Hostname on file | `smarterdog.vercel.app` |

Turnstile → **Customer Log-in Capture** → Settings → Hostname management. Add
`smarterdog.co.uk` and `www.smarterdog.co.uk`, keeping `smarterdog.vercel.app`.

This one genuinely breaks things if missed: Turnstile refuses to issue a
challenge on a hostname that is not on the widget's list, so customer login
would fail on the new domain while working on the old one. It matches on
hostname only — no scheme, no path.

### Known separately: the token is never verified

The widget's own analytics report **zero siteverify requests** against five
solved challenges, and Cloudflare shows a warning on the widget saying as much.
Nothing in `supabase/functions/` calls siteverify either. The token is issued,
solved and then discarded, so the captcha is currently a visual speed bump
rather than bot protection.

That is pre-existing and **not** a cutover blocker — it is equally unverified on
the current domain. Adding the hostnames keeps behaviour identical. Wiring up
verification is its own piece of work: either enable CAPTCHA in Supabase
Authentication → Attack Protection with this widget's secret key, or call
siteverify in the auth path. Do it deliberately, with testing, not during a
domain move.

## 5. Edge Function CORS — ✅ DONE 11 September 2026

Checked on 11 September against `nlzhllhkigmsvrzduefz`: of the ten
`*_ALLOWED_ORIGINS` variables the code can read, **only one is actually set** —
`POSTCODE_LOOKUP_ALLOWED_ORIGINS`.

The other nine fall through to `DEFAULT_ALLOWED_ORIGINS` in
[`_shared/cors.ts`](../../../supabase/functions/_shared/cors.ts), which #825
already updates to name `smarterdog.co.uk` and `www.smarterdog.co.uk`. They
need nothing — and they genuinely will pick the change up, because
[`deploy-edge-functions.yml`](../../../.github/workflows/deploy-edge-functions.yml)
redeploys **every** function when anything under `_shared/` changes rather than
only the directories that changed. So merging #825 is what fixes those nine.

That left one to set by hand, now done — the digest changed, confirming it
took. It was set as a whole list rather than appended to, because the API
returns a digest and not the value, so there was nothing to append to:

```bash
supabase secrets set --project-ref nlzhllhkigmsvrzduefz \
  POSTCODE_LOOKUP_ALLOWED_ORIGINS="https://smarterdog.co.uk,https://www.smarterdog.co.uk,https://smarterdog.vercel.app,http://localhost:5173,http://localhost:5174"
```

The running functions keep their old value until they next cold-start, so this
takes effect when #825 merges and redeploys them — which it will, for the
`_shared/` reason above. Nothing further to do.

Re-check the inventory if time has passed, since a new function may have
brought its own variable:

```bash
supabase secrets list --project-ref nlzhllhkigmsvrzduefz | tr ',' '\n' | grep ALLOWED_ORIGINS
```

Postcode lookup is how the customer booking wizard turns a postcode into an
address, so if this one is wrong the symptom is address lookup failing on the
new domain while everything else works.

## 6. Lower the TTL, then disable the publisher — AUTHORISE

At Bluehost, lower the TTL on the apex `A` and the `www` record to the minimum
offered (typically 300s). **Wait for the old TTL to expire** before step 7 —
otherwise rollback is as slow as the old TTL, which is the difference between a
five-minute and a four-hour outage if something is wrong.

Then set the repository variable `WEBSITE_PUBLISHER_ENABLED` to `false`
(GitHub → Settings → Secrets and variables → Actions → Variables), and confirm
no publish is in flight in the Actions tab.

## 7. Switch DNS — AUTHORISE

At Bluehost, change **only** these two records to the values Vercel gave in
step 2:

- apex `A`: `50.6.153.109` → Vercel's value
- `www`: `103.169.142.0` → Vercel's value

Leave nameservers, MX and everything else exactly as they are.

Then wait for Vercel to issue certificates for both names — the Domains screen
goes from misconfigured to valid on its own, usually within minutes.

**Then change the Supabase Site URL**, deferred from step 3: Authentication →
URL Configuration → Site URL → `https://smarterdog.co.uk` → Save. It feeds
`{{ .SiteURL }}` in email templates, so it is correct only once the records are
live — which is why it waits until here rather than going in with the rest of
the auth config.

## 8. Verify

```bash
# routing
for p in / /book /stafflogin /customer/book /nonsense; do \
  curl -s -o /dev/null -w "$p -> %{http_code} %{redirect_url}\n" https://smarterdog.co.uk$p; done

# the one that matters most: the marketing site must stay crawlable
curl -s https://smarterdog.co.uk/robots.txt | head -12

# certificate covers both names
curl -sI https://www.smarterdog.co.uk | head -1
```

Expect `/` to be the marketing site, `/book` and `/stafflogin` to reach the
app, `/customer/book` to redirect to `/book/new`, `/nonsense` to fall through
to the marketing site, and `robots.txt` to begin `User-agent: *` / `Allow: /`.

Then, by hand — these cannot be checked before the cutover because they depend
on steps 3 and 4:

- a real staff login
- a real customer login, including the Turnstile captcha
- a password reset, end to end, following the emailed link
- the salon's email still arriving

## 9. Only now, flip the three hardcoded origins — AUTHORISE

Doing these before DNS resolves to Vercel points real customers at a URL
Bluehost would answer.

- `CUSTOMER_PORTAL_URL` in
  [`_shared/salonConstants.ts`](../../../supabase/functions/_shared/salonConstants.ts)
  → `https://smarterdog.co.uk/book/login`. This is the link WhatsApp messages
  send customers. Setting the `CUSTOMER_PORTAL_URL` Edge Function secret
  overrides it without a deploy, which is the faster path.
- `BOOKING_URL` in
  [`website/src/constants/links.js`](../../../website/src/constants/links.js)
  → `https://smarterdog.co.uk/book` — the marketing site's "Book now". Under
  `website/**`, so it triggers `website.yml`; confirm
  `WEBSITE_PUBLISHER_ENABLED` is already `false` from step 6 first.
- `DEFAULT_ORIGIN` in
  [`scripts/check-sentry-live.mjs`](../../../scripts/check-sentry-live.mjs)
  → `https://smarterdog.co.uk`. Not urgent; `vercel.app` serves the same
  deployment and the script works from either origin.

## 10. Staff devices

Changing origin invalidates every installed PWA and every Web Push
subscription — the browser treats the new domain as a different site. Staff
need to re-add the app to their home screens from `smarterdog.co.uk/stafflogin`
and re-enable device notifications in Settings → Your Account. Tell them before
the cutover, not after.

## Rollback

Restore the two DNS records — apex `A` to `50.6.153.109`, `www` to
`103.169.142.0` — and set `WEBSITE_PUBLISHER_ENABLED` back to `true`. Bluehost
`public_html/` is untouched throughout, so the previous site returns as soon as
the records propagate, which is why step 6 lowers the TTL first.

The merged code can stay merged. It is inert while the domain points at
Bluehost: `smarterdog.vercel.app` keeps serving both apps, and every old URL
still redirects.
