# Messenger inbox

Dark launch. Do not apply the migration to production from this change, and do
not send a message. The flags stay off.

## Identity

`whatsapp_conversations.phone_e164` stays required for WhatsApp, SMS and email.
Messenger rows use `messenger_page_id` + `messenger_psid`, with a null phone.
Staff links a thread to a `humans` row in `messaging_identities`. No automatic
phone match and no profile-name match.

## Path

- `messenger-webhook` verifies `X-Hub-Signature-256`, returns 200 quickly, and
  writes only when `MESSENGER_INBOX_ENABLED=true`.
- `messenger-send` is staff-only. `RESPONSE` inside 24 hours. `HUMAN_AGENT`
  only for a person-typed reply when `MESSENGER_HUMAN_AGENT_ENABLED=true`.
- The WhatsApp agent ignores `object: "page"`. `whatsapp-send` refuses
  `channel = messenger`.

## Done when

Webhook parse, signature, echo dedupe, window, send and flag-off tests pass,
and the staff inbox shows a Messenger badge and filter only when the Vite flag
is on.
