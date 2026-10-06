# Customer address search

Status: Active

Issue: [#944](https://github.com/leamonline/Smarter-dog-bookings/issues/944)

Implementation: [Geoapify plan](plans/active/2026-10-05-geoapify-address-search.md)

Signup and profile completion use Geoapify address suggestions with manual
entry. Customers type their house number/name, street and town, then choose
Find address or Enter. Typing alone sends no request. The customer confirms a
complete UK suggestion; postcode/city/street-only locations are not addresses.
Open-data coverage can miss houses and flats. Manual entry is always available.

## Account and secret setup

1. Create a free account at [Geoapify My Projects](https://myprojects.geoapify.com/),
   create a project for Smarter Dog, and obtain its API key.
2. Confirm it uses the Free plan. The published allowance is 3,000 credits/day
   and five requests/second; one autocomplete call uses one credit. No card is
   required. Commercial production usage is allowed with attribution:
   [pricing](https://www.geoapify.com/pricing/).
3. Add `GEOAPIFY_API_KEY` in Edge Function Secrets for the explicit Smarter Dog
   production project `nlzhllhkigmsvrzduefz`. Never commit the key, put it in a
   `VITE_` value, paste it in an issue/log, or add it to the browser request.
4. The key is used by a server-side GET request to Geoapify, not a request from
   the salon's browser origin. Configure any provider restrictions accordingly;
   a browser-only origin restriction must not reject the Edge server.
5. Release through the repository's existing main workflows. Key availability
   and provider response checks are separate from code/build verification.

The picker shows Geoapify and OpenStreetMap attribution near address data,
including restored/manual views. Do not remove it from the Free plan.

## Request and failure contract

The historical `postcode-lookup` name is retained for cached clients. New
requests are `{ text: "6 Back Lane, Mottram, Hyde" }`; cached clients can send
`{ postcode: "SK14 6JE" }`. Search text is 3–200 characters, trimmed, without
control characters. Invalid input is rejected before a provider call.

Successful responses remain `{ postcode, addresses }`; each suggestion includes
`line`, its own canonical `postcode` and null `udprn`. Geoapify does not supply
Royal Mail PAF identifiers. Postcode-only searches may find no selectable
premises; this is not a complete postcode-to-all-houses database.

The secret stays in the Edge process. The provider receives search text only,
with a UK filter and at most ten suggestions. The upstream wait is bounded to
ten seconds. Existing per-IP (8/60s) and global (300/60s) rate limits remain;
these protect bursts, not the whole daily allowance. Monitor Geoapify's account
usage and stay on its Free plan. A missing key returns 500/not_configured;
invalid input 400; rate limiting 429; provider HTTP/format/transport failures
502/upstream. Only a valid empty response means no matches.

The provider can retain request details for access control, usage statistics and
troubleshooting; its published policy generally limits successful-request data
to 24 hours. See [Geoapify's privacy policy](https://www.geoapify.com/privacy-policy/).
The proxy sends the search text and server request metadata, without customer
identity, phone or dog details.

If lookup is unavailable, use manual entry without changing required owner
fields or policy acceptance. Logs contain bounded `geoapify_upstream_NNN`,
`geoapify_invalid_response` or `geoapify_request_failed` codes. Do not collect raw
provider bodies, request URLs, keys, addresses or customer records for diagnosis.

## Verification and rollback

Use synthetic/public addresses such as the salon's published address. Verify a
selected house/street/postcode and manual recovery in a mobile browser; a map
centroid or a city-only result is not successful postal-address verification.
Record exact frontend/function deployment evidence. Never infer local house or
flat coverage from the provider's plan or a mocked test.

Auth inventory metadata is under `_shared/`, so its update triggers the existing
workflow's full Edge redeploy. Keep all entrypoint/type/auth gates intact. There
is no schema change. A reviewed revert can restore prior code, but it cannot
repair the previous APITier 402. Its unused secret is retained; no paid fallback
or paid-account change is part of this integration.
