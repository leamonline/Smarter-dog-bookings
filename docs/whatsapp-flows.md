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
supabase secrets set --project-ref "<project-ref>" FLOW_PRIVATE_KEY="$(cat flow-keys/private.pem)"
supabase secrets set --project-ref "<project-ref>" FLOW_PASSPHRASE="<the passphrase>"
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
supabase functions deploy whatsapp-flow-endpoint --project-ref "<project-ref>" --no-verify-jwt
supabase functions deploy whatsapp-send --project-ref "<project-ref>"  # redeploy: now has the `flow` mode
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

## Booking entry (auto-trigger) + multi-dog

Flow A is now wired into the conversation and books **1–4 dogs in one
visit** (mirroring the customer portal wizard).

**The entry journey (recognised customer texts to book):**

1. `whatsapp-agent` detects new-booking intent (`guessIntentFromText` ===
   `booking_propose`) and auto-sends **Message 1** — a tap-to-confirm
   identity message (`whatsapp-send` mode `book_entry`): "Hi [Name] 👋 …
   shall we get you booked in?" with **Yes, book in** (`bookentry:start`)
   and **Not me** (`bookentry:notme`). This bypasses the staff-wait gate.
2. **Yes** → the agent sends **Message 2** — the portal sign-in link in the
   body **plus** a **Book on WhatsApp** Flow CTA (`whatsapp-send` mode
   `flow`). **Not me** → handed to staff (flagged draft); never auto-books.
3. The Flow runs: **SELECT_PET (checkboxes, 1–4 dogs)** → one screen per dog
   **DOG_A…DOG_D** (service + add-ons together; the endpoint advances by the
   letter in the screen id and jumps to the date screen once the last
   selected dog is done) → **DATE** → **TIME** (only slots that fit the whole
   group) → **CONFIRM** → **SUCCESS**. Per-dog screens are distinct (not a
   loop) because Meta's routing model is forward-only and screen ids must be
   letters/underscores — no digits.

Identity safety: the customer is confirmed by the tap; the dogs by the
Flow's server-side multi-select (it only lists *their* dogs and re-checks
ownership at the insert).

**Multi-dog write path.** Drop-off times and per-dog seat assignments come
from `findGroupedSlots` — the same 2-2-1 engine the portal uses, mirrored
for Deno in `supabase/functions/_shared/capacity.ts` (a parity test guards
against drift). The grouped insert goes through a service-role RPC
**`create_whatsapp_booking_group(p_bookings, p_booking_date, p_human_id)`**
(migration `20260619120000…`) — the WhatsApp twin of
`create_customer_booking_group`, with the owner passed explicitly from the
trusted flow session (the customer RPC keys off `auth.uid()`, which a
service-role call doesn't have). One shared `group_id`; the capacity +
calendar triggers remain the hard guard.

**Flags / env:**
- `WHATSAPP_BOOK_ENTRY_ENABLED` (default `false`) — master switch for the
  auto-entry. Ship dark, flip on after testing.
- `WHATSAPP_BOOKING_FLOW_ID` — the published Flow id the "Book on WhatsApp"
  CTA opens.
- `CUSTOMER_PORTAL_URL` — overrides the portal link (default
  `https://smarterdog.co.uk/book/login`). The default pointed at the Vercel
  origin until 12 September 2026, which redirected to the same screen but
  showed customers a hostname that was not the salon's. Changed once the
  [domain cutover](superpowers/runbooks/2026-09-11-smarterdog-domain-cutover.md)
  made it same-origin (step 9). If a WhatsApp reply still shows a `vercel.app`
  link, this secret is set in the project and overriding the default.

## Not done yet (follow-ups)

- **Known live behaviour for the Edge tranche — booking-intent re-entry.**
  The fast path suppresses repeat booking prompts for only three minutes.
  After that debounce, a recognised customer's free-text booking reply can
  start booking entry again rather than creating a deterministic staff
  hand-off. The planned longer-horizon copy may make replies such as
  "yes, October please" more likely. No production incident was confirmed in
  the bounded audit and volume was low, so this did not block the temporary
  UI guard; the Edge tranche must add explicit routing, de-duplication and
  hand-off behaviour before treating the journey as closed.
- **`nfm_reply` handling** — the flow-completion receipt isn't parsed by the
  agent yet (booking already happens at CONFIRM, so this is cosmetic).
- **Large-dog per-slot precision** — large dogs are offered the candidate
  large slots; the trigger is the final guard. Small/medium are exact. Large
  multi-dog groups beyond what the 2-2-1 engine fits fall back to the portal.
- **`BACK` across the per-dog DOG_A…DOG_D screens** re-renders the dog at
  that screen's letter; the forward flow is the primary path.
- **Free-text reply to Message 1** (instead of tapping) falls through to the
  normal staff-review path.
- **Flow B (intake)** and **Flow C (cancel/reschedule)**.
