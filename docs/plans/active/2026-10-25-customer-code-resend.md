# Resend a customer sign-in code

Status: Active
Issue: #1073 (slice 4)
Base: origin/main e138ae69d89006870a42d6a3019e018b5d47a59a
Last verified: 2026-10-25
Owners: CustomerLoginPage and its component tests
Dependencies: None
Related requirements: Customer sign-in recovery
Related ADRs: None

## Goal and why

A customer who has not received an SMS can request another from the code screen,
without re-entering their phone or losing password-reset intent.

## Current and desired behaviour

The phone, signup and password stages can send codes. The code stage currently
only verifies or returns to phone entry. Add a separate resend action using the
same auth hook and its current phone/signup state. Preserve `otpIsReset`.

## Scope and non-goals

Own the login component, tests and this plan. No server, account-creation policy,
rate-limit, password, notification or database changes. No real SMS is sent by tests.

## Relevant code and architecture

`src/components/auth/CustomerLoginPage.jsx` owns the stage, reset intent,
CAPTCHA token and 60-second cooldown. `useCustomerAuth.sendOtp` sends a code to the
already-checked phone; it carries no signup or reset intent of its own (reset is the
page's `otpIsReset` flag, used at verify). Reuse that callback; do not repeat the phone lookup.
The server retains authentication and throttling authority.

## Data/database and API changes

None. Reuse `onSendOtp(captchaToken)` and `onVerifyOtp(code, { isReset })`.

## UI and security/privacy

Render a fresh Turnstile widget in the code stage; never reuse a consumed token.
Disable resend during submission, cooldown or missing CAPTCHA configuration.
Require a token in the handler. Consume it even after a failed attempt. Keep the
entered code after failure; clear it after a successful resend and announce success.
Verification remains available without CAPTCHA so an already-received code works.
Guard repeated clicks with an in-flight ref. A remounted code screen waits 60 seconds.

## Risks and dependencies

A lost network response might still have sent a code; server throttling remains
necessary. The client timer is a convenience, not a security boundary. A missing
CAPTCHA blocks resend but must not block verification. Preserve signup/reset intent.

## Implementation sequence and testing

1. Add the resend handler and separate code-stage security check.
2. Test first login, signup and reset; cooldown, missing/consumed token, failure,
   success announcement, and verification with missing CAPTCHA.
3. Run login/auth tests and the repository lint, docs, typecheck, migration,
   full test and build checks. Inspect phone, tablet and desktop layout.

## Observability and documentation

Use synthetic component evidence and ordinary CI; do not log phone/code/token.
This plan records the security boundary and verification limits.

## Migration/rollout

No migration. Separate PR; merge deploys the frontend and needs owner release
approval. Revert this PR to remove resend. No flag changes.

## Definition of done and open questions

Tests/checks pass, responsive review complete, PR reviewed. Production CAPTCHA/SMS
is only proven by separately authorised real use. No product decisions outstanding.
