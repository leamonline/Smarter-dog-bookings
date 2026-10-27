# Sign-in capture: security-check investigation

Status: Active evidence record
Date: 2026-10-27
Issue: #1142
Code baseline: a5f356fa

## Observation

The owner's supplied sample-data customer sign-in capture shows Cloudflare's
“Incorrect device time” message and an app sentence saying no clicks are needed.
The supplied archive has no capture script, console/network trace or provider
error callback record. Its precise root cause cannot be reconstructed from the
image. The calendar's displayed date is not evidence of browser clock mocking.

## Provider classification

Cloudflare's [official client error table](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/)
classifies `200100` as a clock/cache problem: the visitor clock may be wrong or
an intermediary may have cached the challenge. This is consistent with the
captured message, not proof that this exact code occurred in that capture.
Site-key and hostname errors are separately classified; do not change provider
configuration to fix an unproved time problem.

## Verified implementation and bounded correction

The customer page previously discarded widget errors after clearing its token,
leaving unconditional reassurance visible. The change presents clock/cache
recovery for callback `200100`, generic connection/reload guidance otherwise,
and preserves entered values. Successful challenges clear errors; expiry and
reset clear success. The staff page's unconditional no-click promise is also
replaced with conditional instructions. No sign-in decoration is changed.

Existing missing-key/test-key production checks and token requirements remain.
No production login, OTP request, secret inspection, account change or CAPTCHA
bypass is part of this investigation. Component tests exercise actual callback
state changes; sample-data browser tests do not establish live CAPTCHA enforcement.

## Reproduction and remaining evidence

Use a clean browser with the real clock to observe the public login widget
without entering a number or submitting a form. Record whether the widget loads,
its error callback and network failure if any. A successful page load alone does
not establish successful token issuance, authentication or provider verification.
For future screenshot automation, freeze application sample time separately from
third-party challenges, or explicitly stub the widget only in the sample capture
harness. Label such a stub synthetic; never ship it as a production fallback.

The exact original capture cause and a full real-device login remain unverified.

## Public page observation

A fresh unauthenticated Chromium mobile context visited the public
`https://smarterdog.co.uk/book/login` on 27 October. It rendered the phone entry
page and a `challenges.cloudflare.com` iframe, with no page exception during the
observation. No number was entered and no form submitted. The live page still
contains the older unconditional reassurance. This establishes widget mounting,
not successful challenge completion, backend enforcement or login success.

A second public-page observation waited up to 15 seconds for a non-empty widget
response without recording its value. It did not complete in that automated
Chromium session. Provider-frame console diagnostics included blocked `data:,`
connections under the challenge's own policy. This does not reproduce the
original device-time message or isolate an application configuration fault.
Automated-browser challenge completion therefore remains unproved; a normal
human-operated iPhone session is still needed for real-device acceptance.
