# WhatsApp Flows

Interactive, form-based WhatsApp journeys (Meta WhatsApp Flows) layered on
top of the existing Cloud API messaging stack. **Flow A — Appointment
Booking** is implemented end-to-end; Flows B (new-client intake) and C
(cancel/reschedule) are planned next.

This is an integration, not a new service: it runs as Supabase Edge
Functions, reuses the existing `META_*` secrets and the `v22.0` Cloud API
path, books against the existing `bookings` table, and is guarded by the
existing 2-2-1 capacity trigger. There are **no named groomers** (the salon
schedules by the 2-2-1 seat model), so Flow A has no groomer screen.

## What was added

| Piece | Path |
|---|---|
| Encryption (RSA-OAEP + AES-GCM, signature) | `supabase/functions/_shared/flowCrypto.ts` |
| Booking logic (pure, `FlowDb` interface) | `supabase/functions/_shared/flowBooking.ts` |
| Services/prices/slots constants (mirror of `src/constants/salon.ts`) | `supabase/functions/_shared/salonConstants.ts` |
| Outbound flow-message builder | `supabase/functions/_shared/flowMessage.ts` |
| Flow Data Endpoint (the brain) | `supabase/functions/whatsapp-flow-endpoint/{index,db}.ts` |
| `flow` send mode | `supabase/functions/whatsapp-send/index.ts` |
| Flow A definition | `whatsapp-flows/appointment-booking.json` |
| Session table | `supabase/migrations/20260526130000_whatsapp_flow_sessions.sql` |
| Scripts | `scripts/{generate-flow-keys,publish-flow,send-flow}.mjs` |
| Tests | `src/lib/whatsapp/*.test.ts` |

## How Flow A works

1. We **send** the Flow (`whatsapp-send` mode `flow`). That mints a
   `flow_token`, writes a `whatsapp_flow_sessions` row binding the token to
   the customer's phone + `human_id`, and sends an interactive `flow`
   message opening on `WELCOME` (rendered inline, no round-trip).
2. Each **Continue** is an encrypted `data_exchange` to
   `whatsapp-flow-endpoint`. It decrypts, looks the session up by
   `flow_token`, merges the submitted field into the session state, and
   returns the next screen + its dynamic data (pets, services priced by the
   dog's size, available days, slots).
3. Availability comes from the existing RPCs `get_small_medium_availability`
   and `get_large_dog_day_availability`. Dates are a radio list of genuinely
   bookable open days (Mon–Wed); times are the 08:30–13:00 drop-off grid.
4. On **CONFIRM**, the endpoint inserts the booking (`source = 'whatsapp_flow'`,
   `status = 'Booked'`). The capacity trigger is the hard guard: if the slot
   was taken in a race it raises `P0001`, which we surface as a "slot taken"
   retry on the time screen. Success shows a `SUCCESS` screen with a
   reference. The booking is created at this step — not at flow completion —
   and is idempotent (a re-confirm returns the same booking).

Customer identity is resolved at **send** time and stored in the session, so
the endpoint (service role, RLS-bypassing) never trusts client-supplied
identity and only ever books for the session's own `human_id`'s dogs.

## One-time setup

### 0. Prerequisites
- A Meta app with WhatsApp added, a WhatsApp Business Account (WABA), a
  registered phone number, and completed business verification.
- The existing webhook + `whatsapp-send` working on the **Meta Cloud API**
  path (Flows are Meta-only — the Twilio `notify-*` path can't deliver them).
- Secrets already set: `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`,
  `META_WABA_ID`, `META_APP_SECRET`, `SEND_INTERNAL_SECRET`.

### 1. Generate the encryption key pair
```bash
npm run flow:generate-keys
# prints a passphrase if you didn't pass one; writes flow-keys/{private,public}.pem
```

### 2. Set the Edge Function secrets
```bash
supabase secrets set FLOW_PRIVATE_KEY="$(cat flow-keys/private.pem)"
supabase secrets set FLOW_PASSPHRASE="<the passphrase>"
```
`META_APP_SECRET` is reused for the request signature — no new value needed.

### 3. Upload the public key to Meta
```bash
export META_ACCESS_TOKEN=... META_PHONE_NUMBER_ID=...
npm run flow:publish -- set-public-key
```

### 4. Apply the migration
Run `supabase/migrations/20260526130000_whatsapp_flow_sessions.sql` against
your project (or `supabase db push`).

### 5. Deploy the endpoint (no JWT — Meta sends none)
```bash
supabase functions deploy whatsapp-flow-endpoint --no-verify-jwt
supabase functions deploy whatsapp-send   # redeploy: now has the `flow` mode
```
Your endpoint URL is
`https://<project-ref>.supabase.co/functions/v1/whatsapp-flow-endpoint`.

### 6. Publish Flow A
```bash
export META_WABA_ID=... FLOW_ENDPOINT_URI="https://<ref>.supabase.co/functions/v1/whatsapp-flow-endpoint"
npm run flow:publish -- deploy "Appointment Booking" whatsapp-flows/appointment-booking.json
# fix any validation_errors, then:
npm run flow:publish -- publish <flowId>
```
Tip: test against the unpublished draft first by sending with `--draft`.

### 7. Send yourself a test
The recipient must have messaged your number within the last 24h.
```bash
export SUPABASE_URL=... SEND_INTERNAL_SECRET=...
npm run flow:send -- --to +447700900123 --flow-id <flowId> --human-id <your-human-uuid> --draft
```

## Troubleshooting

- **Flow stuck on "loading" / decryption errors** — the endpoint returns
  HTTP 421 when it can't decrypt, which tells WhatsApp to refresh the public
  key. Check `FLOW_PRIVATE_KEY`/`FLOW_PASSPHRASE` are set and match the
  public key uploaded in step 3. The keys from `flow:generate-keys` are
  PKCS#8 + AES-256 to avoid the OpenSSL-3 `DECODER routines::unsupported`
  error seen with legacy `openssl genrsa -des3` keys.
- **`invalid signature` (401)** — `META_APP_SECRET` doesn't match the app
  whose number is sending. The endpoint verifies `X-Hub-Signature-256` when
  present.
- **"This booking session has expired"** — sessions live 24h; the
  `flow_token` is unknown or expired. Re-send the Flow.
- **"That slot was just taken"** — the capacity trigger rejected the insert
  (race or full slot). The customer is bounced back to pick another time.
- **Validation errors on publish** — `npm run flow:publish -- status <id>`
  prints them. If Meta requires a newer Flow JSON version, bump `version` in
  `whatsapp-flows/appointment-booking.json`.

## Not done yet (follow-ups)

- **Trigger from a keyword** — auto-send Flow A when a customer texts "book"
  (wire into `whatsapp-agent`). Today the Flow is sent via `flow:send` or a
  `whatsapp-send` `flow` call.
- **`nfm_reply` handling** — the flow-completion receipt isn't parsed by the
  agent yet (booking already happens at CONFIRM, so this is cosmetic).
- **Large-dog per-slot precision** — large dogs are offered the candidate
  large slots; the trigger is the final guard. Small/medium are exact.
- **Flow B (intake)** and **Flow C (cancel/reschedule)**.
