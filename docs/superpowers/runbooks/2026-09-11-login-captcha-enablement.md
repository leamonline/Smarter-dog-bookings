# Enabling login CAPTCHA verification

**Owner action.** Needs the Turnstile widget's **secret** key, which must never
enter this repository. Takes about five minutes. Reversible in one click.

## Why

Until this is switched on, the Turnstile widget on both login pages issues a
challenge, the visitor solves it, and Supabase accepts the token without
checking it. The widget is real; the verification is not.

Background and the decision to enable rather than remove:
`docs/superpowers/specs/2026-09-11-turnstile-verification-design.md`.

## Before the code is even merged

One check belongs earlier than the rest, because merging to `main` auto-deploys
to Vercel production.

**Confirm `VITE_TURNSTILE_SITE_KEY` is set in the Vercel Production environment
before merging.** The login pages now fail closed: with no site key they render
no challenge and disable sign-in entirely, for staff and customers alike, until
the variable is restored and the app redeployed. This repository has already had
one `VITE_` name that everyone assumed was set on Vercel and was not, so check
rather than assume.

## Before you start

The code-side work must already be deployed to production. Confirm the staff
and customer login pages both show a working challenge — if they show
"Sign-in is unavailable right now", `VITE_TURNSTILE_SITE_KEY` is missing from
Vercel and must be fixed **before** going any further.

Take the baseline:

```bash
npm run check:captcha
```

Expect `NOT ENFORCED`, and note that this exits with code 1, so npm prints a
red `ERR!` block afterwards. That is the correct answer, not a broken script —
it is the "before" half of the evidence. If it already says `ENFORCED`, stop:
someone has enabled it and this runbook does not apply.

## Steps

1. In the Cloudflare dashboard, open Turnstile → the "Customer Log-in Capture"
   widget (site key `0x4AAAAAADMvAmN7LsBYiIqZ`) → **Settings**, and copy the
   **secret** key. Do not paste it into this repository, a commit message, a
   chat, or an issue.
2. In the Supabase dashboard, open **Authentication → Attack Protection**.
3. Enable **CAPTCHA protection**, choose provider **Turnstile by Cloudflare**,
   paste the secret key, and save.

## Verify

Seven checks, all seven required.

1. Enforcement:

   ```bash
   npm run check:captcha
   ```

   Expect `ENFORCED` on both probes and exit code 0.

2. Real sign-ins. Sign in on the staff page and on the customer page. A
   verified captcha with broken login is a worse outcome than where we started,
   so do not skip this.

3. First-time customer OTP round-trip. The sign-in above only exercises
   `signInWithPassword`, for a customer who already has one — it never touches
   `sendOtp`. On the customer portal, start as a brand-new phone number:
   request a code, receive the SMS, enter it, and reach the set-password
   stage. `sendOtp` is the path that is both captcha-gated and costs the salon
   money per message, so it earns its own check rather than being assumed to
   work because password sign-in did.

4. Settings → Your Account → **Password** should explain how to reset through
   the staff sign-in page, with no send button. Save any changes, sign out,
   choose **Forgot password?**, complete the security check and request the
   reset email. Confirm the email arrives and its link opens the reset page.
   The former settings button was removed because it could not supply the
   required CAPTCHA token (#851).

5. **Invite a throwaway staff account** from the Supabase dashboard, then
   delete it. Staff invites go out via GoTrue's `/invite` endpoint, which is on
   the captcha-gated list — and nothing in this repository calls it, so no
   amount of code review can tell you whether it still works. The sign-in page
   tells new staff "Ask the salon owner to send you an invite", so this is a
   real route. Better to find out now than the morning a new groomer starts.

6. **Re-run `npm run check:captcha` and read the `/verify` line.** It is
   informational and does not affect the verdict. It should say `not-enforced`.
   If it says `enforced`, stop and roll back: the customer login page's OTP code
   stage renders no captcha widget, so customers holding a valid texted code
   would be unable to finish signing in.

7. Cloudflare analytics. The widget's siteverify count moves off zero and the
   dashboard warning about siteverify not being called clears. The count should
   track solved challenges from here on.

## Rollback

Turn CAPTCHA protection back off in Supabase → Authentication → Attack
Protection. It takes effect immediately and needs no deploy. With the setting
off, the widget goes back to being decorative — the state this work was
undertaken to end, but a safe place to stand while you sort out whatever went
wrong.

**One thing the toggle does not undo.** The login pages refuse to submit until
the Turnstile widget has produced a token, and that guard is in the page itself
— it does not consult the Supabase setting. So if the problem is that someone's
browser cannot load Cloudflare's challenge script at all (an extension, a
corporate network, a blocked region), turning the setting off will not let them
in. That case needs the code reverted and redeployed, not a dashboard click.
Rollback fixes enforcement problems; it does not fix a challenge that never
loads.

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
