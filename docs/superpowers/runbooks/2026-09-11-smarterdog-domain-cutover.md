# smarterdog.co.uk domain cutover runbook

**Status:** Complete — executed 11 September 2026, every step including the deferred Supabase Site URL. See the [completion record](#completion-record--11-september-2026).
**Issue:** [#824](https://github.com/leamonline/Smarter-dog-bookings/issues/824)
**Plan:** [single-domain routing](../../plans/active/2026-09-10-smarterdog-domain-routing.md)
**Pull request:** [#825](https://github.com/leamonline/Smarter-dog-bookings/pull/825)

Read the completion record first: three things went wrong on the day and are written up
there. Items that outlived the cutover are under [Still open](#still-open) — the one that
still needs a decision is retiring the Bluehost publisher. The steps below are retained as
the procedure for any future re-cutover, so they stay in the imperative; a ✅ records what
was done on the day, not an instruction to skip that step next time.

Points smarterdog.co.uk at Vercel, so one deployment serves the marketing site
at `/`, customers at `/book` and staff at `/stafflogin`. Every step below
changes an external account and therefore needs explicit owner authority —
preparing this runbook is not that authority.

**Do it at the START of a closure, not during one.** A closed salon does not
mean an unused website: the marketing site and the booking portal run whether
the salon is open or not, and people searching for a groomer — or booking for
after the reopening — still land on smarterdog.co.uk. A broken site on a
working day gets noticed in minutes; a broken site over an unattended week does
not. What the closure actually buys is that no staff are blocked and no
grooming day is disrupted, plus the device re-add (step 10) lands naturally on
the first day back.

So do it while someone is still paying attention, with the rollback to hand —
and on a connection you trust, because rolling back needs working access to
Bluehost.

**Timing.** Both records carry a **14400s (4 hour) TTL**, so the sequence is
roughly: lower both to 300s, wait four hours for the old value to age out of
caches, then switch. About half an hour of attention at each end, with the wait
in between. After the switch, rollback propagates in five minutes rather than
four hours — which is the entire point of the wait.

## Completion record — 11 September 2026

The cutover is done. `smarterdog.co.uk` serves the marketing site, `/book` the
customer portal and `/stafflogin` the staff app, all verified live.

**Three things went wrong. All were mine, and all are worth reading before the
next domain move.**

### 1. Legacy staff paths served the marketing site

`/today` and `/dogs` returned the salon's homepage after the merge. The booking
app's own resolver redirects those, but on a merged origin it never runs — `/`
is the marketing site, so an unmatched path falls through to the website's
catch-all and the website's JavaScript loads instead. The redirect has to be at
the edge. Fixed in #826.

The preview check missed it because it tried `/nonsense-page`, which is
*supposed* to reach the website. Testing an invented path proves nothing about
real retired paths.

### 2. Three subdomains followed the apex to Vercel

`webmail`, `cpanel` and `ftp` were CNAMEs pointing at `smarterdog.co.uk`. When
the apex moved, they moved with it, and Bluehost's webmail became unreachable —
during the owner's holiday.

This runbook said "only the apex A and www change", which was wrong. It checked
MX and the A records but never asked **what depends on the apex**. Before moving
an apex, list every record whose target is the domain itself. They are now A
records on `50.6.153.109`, matching `mail`, `whm`, `autoconfig` and
`autodiscover` — the four that survived precisely because they were A records.

### 3. HSTS `includeSubDomains` pinned subdomains we do not serve

Inherited from the booking app's own config, where the deployment owned its
whole `*.vercel.app` name. On the real domain it told browsers to force HTTPS on
`webmail`, `cpanel` and `ftp` — which have no valid certificate — for a year.
Fixed in #828; HSTS now covers only the apex and `www`.

### Certificate issuance needed a manual nudge

Bluehost's two nameservers answered the *same query* inconsistently for around
half an hour (`ns1` returned the old address roughly half the time). Let's
Encrypt validation kept failing, so no certificate issued and the site was down
over HTTPS. `vercel certs issue` succeeded once the answers settled. If this
recurs: check authoritative consistency with repeated `dig @ns1` / `@ns2` before
assuming Vercel is at fault.

### Done

Every step of this runbook, including the Supabase **Site URL** change that was
deliberately deferred until the domain resolved (it feeds `{{ .SiteURL }}` in
email templates, so moving it earlier would have put dead links in anything
sent during the gap).

### Decided: the Bluehost publisher stays on

`WEBSITE_PUBLISHER_ENABLED` is deliberately back to **`true`**, reversing what
step 6 of this runbook says. That instruction was written before there was a
working Vercel deployment to compare against.

Nothing reaches Bluehost any more — the domain resolves to Vercel, which is what
serves the site. So publishing there affects no visitor. What it does buy is a
**warm rollback target**: if DNS ever has to go back to `50.6.153.109`, it lands
on a current site rather than the snapshot frozen on 11 September.

Turn it off once a rollback is no longer plausible — a few weeks is sensible.
When you do, that is step 5 of the plan ("publisher retirement") and the deploy
job in [`website.yml`](../../../.github/workflows/website.yml) can go with it.
The FTP secrets (`BLUEHOST_FTP_HOST`, `BLUEHOST_FTP_USER`,
`BLUEHOST_FTP_PASSWORD`) should be removed at the same time.

Until then it is a decision, not drift. The previous occupant of this page,
`WEBSITE_DEPLOY_ENABLED`, sat reading `true` while wired to nothing at all —
which is exactly what a variable looks like when nobody wrote down why.

### Still open

- Staff re-add the app to their home screens from `smarterdog.co.uk/stafflogin`
  and re-enable device notifications — changing origin invalidates both.
- `webmail.smarterdog.co.uk` has **no valid certificate on any port**;
  Bluehost serves `*.bluehost.com` on 443 and a `mybluehost.me` name on 2096.
  Plain HTTP works, so webmail logins travel unencrypted. Pre-existing, not
  caused by this move. `https://mail.smarterdog.co.uk:2096` is the same mailbox
  with a certificate that validates.
- ~~Delete the repository variable `WEBSITE_DEPLOY_ENABLED`~~ — done
  11 September 2026.
- Turn `WEBSITE_PUBLISHER_ENABLED` off once rollback is no longer plausible
  (see above).

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

## 3. Supabase Auth — ✅ DONE 11 September 2026 (redirect URLs here, Site URL at step 7)

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

**Site URL — ✅ done 11 September 2026, at the DNS switch (step 7).** It was
`https://smarter-dogs-smart-humans-smarterdog.vercel.app/` and is now
`https://smarterdog.co.uk`. On a re-run, defer it to step 7 again: Supabase uses
it as the fallback redirect and as `{{ .SiteURL }}` in email templates, so
pointing it at a hostname before DNS reaches it would put dead links in any
email sent in between.

## 4. Turnstile — AUTHORISE

**The widget is not in the Cloudflare account you land in by default.** The
account reached from `dash.cloudflare.com` as `leam@leamonline.uk` shows *no*
Turnstile widgets at all, which reads like Turnstile was never set up. It was —
in a second account.

| | |
| --- | --- |
| Cloudflare login | the **`leam.waddington@…`** account, *not* `leam@leamonline.uk` |
| Widget | **Customer Log-in Capture** (Application security → Turnstile) |
| Site key | the value of `VITE_TURNSTILE_SITE_KEY` in the Vercel project — read it there rather than from a screenshot |

Turnstile → **Customer Log-in Capture** → Edit widget → Hostname Management.
Add `smarterdog.co.uk` and `www.smarterdog.co.uk`, keeping
`smarterdog.vercel.app`, then **Update** — the chips appear in the field before
the change is saved, so it is easy to leave without saving.

✅ Done 11 September 2026: three hostnames configured.

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
  → `https://smarterdog.co.uk/book/login` — the marketing site's "Book now".
  ✅ Done in [#835](https://github.com/leamonline/Smarter-dog-bookings/pull/835)
  on 12 September 2026; it had been missed, so every booking control kept
  sending customers to `smarterdog.vercel.app` for a day after the cutover.
  Under `website/**`, so it triggers `website.yml`; confirm
  `WEBSITE_PUBLISHER_ENABLED` is already `false` from step 6 first.

  **`/book/login`, not `/book`** — this instruction said `/book` until #835,
  which would have been a redirect loop. The marketing site has its own
  `/book` route that redirects to whatever `BOOKING_URL` holds, so aiming the
  constant at `/book` makes that route redirect to itself. On the live origin
  it never fires, because `vercel.json` rewrites `/book` to the booking app at
  the edge before the marketing app sees it — which is exactly why the loop is
  easy to miss in review. Bluehost carries only the marketing build and has no
  such rewrite, so a DNS rollback (below) would make it real, turning a
  degraded rollback into a broken one. `/book/login` does not match that route,
  and matches the `CUSTOMER_PORTAL_URL` target above.
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

## Staff home-screen launch route

The staff manifest at `/app/manifest.json` launches `/staff/` and scopes the
installed app to `/staff/`. Verify both `/staff` and `/staff/` serve the booking
shell (`/app/assets/` scripts and `/app/manifest.json`), never the marketing
shell (`/assets/` scripts and `/manifest.json`). The trailing-slash entrance
needs an explicit Vercel rewrite; do not assume `/staff/:path*` covers it.

After deployment, add the staff portal to an iPhone home screen, close it and
launch the icon. Confirm the staff sign-in page or authenticated dashboard
opens. Test with a fresh install so a service worker cache cannot hide a server
routing failure. Also retry an existing icon: its `/staff/` launch URL should
now work without changing the saved manifest.
