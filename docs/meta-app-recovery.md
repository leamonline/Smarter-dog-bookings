# Meta App Recovery Runbook

What to do when the Meta App that owns your WhatsApp integration has been
deleted (or you're about to recreate one). Specific to this repo — every
script, secret, and edge function name has been verified against the code.

## TL;DR

1. Try to restore the deleted app at `developers.facebook.com → My Apps`.
2. If it's gone, recreate the app shell and re-link your existing WABA +
   phone number (those survive at the Business portfolio level).
3. Update four Supabase secrets, re-register the phone number, re-upload the
   Flow encryption public key, re-deploy and re-publish the Flow, then
   verify end-to-end.

You do **not** need to redeploy any edge functions — Supabase reads secrets
at runtime, so `supabase secrets set` takes effect on the next invocation.

You do **not** lose the phone number, templates, or business verification —
those live on the WABA (visible at `business.facebook.com`), not the App.

---

## Step 1 — Try to restore first

`developers.facebook.com → My Apps`. Look for a "Deleted" or "Pending
deletion" filter. If you see your app there, hit **Restore**. Apps remain
recoverable for ~30 days after deletion. If restored, you're done —
existing secrets keep working.

## Step 2 — Recreate the app (only if Step 1 fails)

1. `developers.facebook.com` → **Create App** → type **Business**.
2. Add the **WhatsApp** product to the new app.
3. In **WhatsApp → API Setup**, attach your existing WABA and phone number
   from the dropdown (they should already be in your Business portfolio).
4. Note down the four values you'll need next:
   - **App Secret** → App Settings → Basic → "Show". This is the new
     `META_APP_SECRET`.
   - **WABA ID** → usually unchanged (it's the WABA, not the App). Confirm.
   - **Phone Number ID** → usually unchanged. Confirm.
   - **Permanent access token** → create a **System User** in Business
     Settings → Users → System Users, assign it the WhatsApp Business
     Account asset with full control, and generate a token with
     `whatsapp_business_messaging` and `whatsapp_business_management`
     permissions. *Tokens generated from the app dashboard expire in 24
     hours — System User tokens are the permanent kind.*

## Step 3 — Update Supabase secrets

These four are the only ones that need to change. The rest
(`META_WEBHOOK_VERIFY_TOKEN`, `FLOW_PRIVATE_KEY`, `FLOW_PASSPHRASE`,
`ANTHROPIC_API_KEY`, `SEND_INTERNAL_SECRET`, `SUPABASE_*`) are yours, not
tied to the deleted app — keep them.

```sh
supabase secrets set META_ACCESS_TOKEN="<new System User token>"
supabase secrets set META_APP_SECRET="<new app secret>"
supabase secrets set META_WABA_ID="<waba id — usually unchanged>"
supabase secrets set META_PHONE_NUMBER_ID="<phone id — usually unchanged>"
```

These secrets power `whatsapp-webhook`, `whatsapp-send`, `whatsapp-admin`,
`whatsapp-register`, `whatsapp-agent`, and `whatsapp-flow-endpoint`. No
redeploy needed.

## Step 4 — Re-register the phone number

Do this *before* the webhook step. If number registration against the new
app fails, you'll know immediately instead of after another 20 minutes of
setup.

The repo has a `whatsapp-register` edge function exactly for this — it
calls Meta's `/register` endpoint with your 2FA PIN:

```sh
curl -X POST "https://<your-ref>.supabase.co/functions/v1/whatsapp-register" \
  -H "x-internal-secret: $SEND_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"pin":"<your 6-digit 2FA PIN>"}'
```

Expect `{ "success": true }`. If you get an error, Meta returns a clear
code (PIN too weak, number not verified, etc.) — read it verbatim.

## Step 5 — Re-register the webhook

In the new app: **WhatsApp → Configuration → Webhook**:

- **Callback URL**: `https://<your-ref>.supabase.co/functions/v1/whatsapp-webhook`
- **Verify token**: the existing value of your `META_WEBHOOK_VERIFY_TOKEN`
  secret. The function at `whatsapp-webhook/index.ts:161` checks
  `mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN` and only
  then echoes the challenge.
- **Subscribe to**: the `messages` field on the WABA (this is the one
  the webhook handler actually parses — `change.value.messages[0]`).

If you also rely on template status notifications (e.g. for approved /
rejected template updates), subscribe to `message_template_status_update`
too. Otherwise just `messages`.

## Step 6 — Re-upload the Flow public key

The deleted app dropped the registered encryption key, so Meta needs to be
re-given the public half that pairs with your existing `FLOW_PRIVATE_KEY`.

If you still have `flow-keys/public.pem` locally:

```sh
export META_ACCESS_TOKEN="<new token>"
export META_PHONE_NUMBER_ID="<phone id>"
npm run flow:publish -- set-public-key
```

If you don't have `flow-keys/public.pem` locally any more (you should
have deleted it after the initial setup):

```sh
npm run flow:generate-keys              # writes flow-keys/{private,public}.pem
supabase secrets set FLOW_PRIVATE_KEY="$(cat flow-keys/private.pem)"
supabase secrets set FLOW_PASSPHRASE="<the passphrase it printed>"
npm run flow:publish -- set-public-key  # uploads the new public half
rm -rf flow-keys                        # don't keep the private key on disk
```

## Step 7 — Re-deploy the Flow

> ⚠️ The old runbook said `npm run flow:publish -- deploy` does this in one
> shot. It does **not**. `deploy` requires two arguments and explicitly
> does **not** publish — it just stages.

```sh
export META_ACCESS_TOKEN="<new token>"
export META_WABA_ID="<waba id>"
export FLOW_ENDPOINT_URI="https://<your-ref>.supabase.co/functions/v1/whatsapp-flow-endpoint"

# Stage: create the Flow, set its endpoint URI, upload the JSON.
npm run flow:publish -- deploy <flow-name> <path/to/flow.json>
# e.g. npm run flow:publish -- deploy booking-v1 whatsapp-flows/booking.json

# The output prints the NEW flow ID. Note it down.

# Publish as a separate, deliberate step.
npm run flow:publish -- publish <new-flow-id>
```

The new flow ID replaces the old one. There's nothing hardcoded in the
edge functions — `flow_id` is passed in by the caller — but you'll need
the new ID anywhere you trigger Flow sends manually (e.g. the
`send-flow.mjs` script).

## Step 8 — Verify end-to-end

```sh
# 1. Webhook handshake — happens automatically when you save the webhook
#    config in Step 5. If Meta accepted it, this already passed.

# 2. Outbound send via the new token.
#    Send any non-Flow message to confirm META_ACCESS_TOKEN + phone ID work.

# 3. Flow open. The recipient must have messaged your number within the
#    last 24h (interactive messages can't open a fresh conversation window).
export SUPABASE_URL="https://<your-ref>.supabase.co"
export SEND_INTERNAL_SECRET="<your secret>"
npm run flow:send -- --to +447700900123 --flow-id <new-flow-id> --draft

# Expect HTTP 200 and no decryption error in the function logs.
# A decryption error here means Step 6 (public key upload) didn't take —
# re-run set-public-key.
```

## Things that may still bite you afterwards

- **Messaging tier resets.** A brand-new app starts at the lowest messaging
  tier even if the underlying WABA was previously approved for higher
  volume. You may hit unexpected rate limits for the first few days while
  it climbs back. Business verification at the portfolio level *usually*
  carries over, but check Business Settings → Security Center.
- **App review.** If the deleted app had any reviewed permissions beyond
  the default WhatsApp ones, the new app may need to go through review
  again. For a standard Cloud API + Flows setup with a System User token
  you generally don't.
- **Webhook secret rotation.** If you ever want to rotate
  `META_WEBHOOK_VERIFY_TOKEN`, you have to update the Supabase secret AND
  re-save it in the Meta webhook config UI — they're a shared secret.
- **Don't redeploy edge functions during recovery.** It's tempting but
  unnecessary, and it just adds variables to debug if something breaks.
  Secrets are runtime-injected.

## Sanity table — secrets and where they're read

| Secret                       | Read by                                                              | Changes? |
|------------------------------|----------------------------------------------------------------------|----------|
| `META_ACCESS_TOKEN`          | whatsapp-send, whatsapp-admin, whatsapp-register, publish-flow CLI   | Yes      |
| `META_APP_SECRET`            | whatsapp-webhook, whatsapp-flow-endpoint                             | Yes      |
| `META_WABA_ID`               | whatsapp-admin, publish-flow CLI                                     | Usually no |
| `META_PHONE_NUMBER_ID`       | whatsapp-send, whatsapp-admin, whatsapp-register, publish-flow CLI   | Usually no |
| `META_WEBHOOK_VERIFY_TOKEN`  | whatsapp-webhook                                                     | No       |
| `FLOW_PRIVATE_KEY`           | whatsapp-flow-endpoint                                               | No       |
| `FLOW_PASSPHRASE`            | whatsapp-flow-endpoint                                               | No       |
| `ANTHROPIC_API_KEY`          | whatsapp-agent, dashboard-summary                                    | No       |
| `SEND_INTERNAL_SECRET`       | all whatsapp-* functions                                             | No       |
| `SUPABASE_URL` / `_SERVICE_ROLE_KEY` | auto-injected by Supabase                                    | No       |
