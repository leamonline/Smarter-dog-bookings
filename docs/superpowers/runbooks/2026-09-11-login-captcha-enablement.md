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

Four checks, all four required.

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

4. Cloudflare analytics. The widget's siteverify count moves off zero and the
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
