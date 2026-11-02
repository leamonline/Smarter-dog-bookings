# Messenger in the staff inbox

**Status:** Accepted for the dark launch. Not enabled in production by a merge.

Staff can read and reply to Facebook Page (Messenger) conversations in the
same inbox as WhatsApp, SMS and email. The channel stays off until Leam sets
the flags below. A merge deploys the functions and, once Vercel builds it, the
staff app. It does not apply the database migration and it does not send a
message.

## What changed for the other channels

WhatsApp, SMS and email are still unique on `(phone_e164, channel)`. That
index is not rebuilt. `phone_e164` is nullable only when `channel` is
`messenger`, and a check rejects a WhatsApp, SMS or email row with no phone
and a Messenger row that has one. `humans.preferred_channel` does not gain
`messenger`, so reminders are not routed there. The daily closure suggestion
does not look at the phone, so a quiet Messenger thread can be suggested for
closure on the same rules as any other thread.

Messenger threads start in `human_takeover` with auto-send and autonomous
booking forced off. The booking agent ignores a Page payload if one is posted
to the WhatsApp webhook by mistake. It does not match a page-scoped id to a
phone, and it does not send. Staff can still use **Generate reply**, which
only fills the box. Approving a draft sends it as a normal reply inside the
24-hour window and never with the `HUMAN_AGENT` tag.

A staff member links a thread to a customer by hand. The link is stored in
`messaging_identities` and on the conversation's `human_id`. A later message
from the same Page and page-scoped id reuses that link. A profile name is not
stored and is not a match key.

## What Leam does in the Meta app

The app is the existing one, id `1546221320268838`. The webhook URL is **not**
the WhatsApp function. It is:

`https://<project-ref>.supabase.co/functions/v1/messenger-webhook`

Use the same verify token as `META_WEBHOOK_VERIFY_TOKEN`. The signature uses
the same `META_APP_SECRET`.

1. In the app dashboard, add the **Messenger** product if it is not there.
2. Generate a **Page access token** for the salon's Facebook Page, from a
   person who can perform the `MESSAGING` task on that Page. The token needs
   `pages_messaging` and `pages_manage_metadata`.
3. Subscribe the Page to this webhook. Meta's Page webhook guide is
   [Webhooks for Pages](https://developers.facebook.com/docs/pages-api/webhooks-for-pages/)
   and the Messenger fields are listed in
   [Messenger webhooks](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks).
   Subscribe these fields: `messages`, `message_echoes`, `message_deliveries`,
   `message_reads`, `messaging_postbacks`.
   Installing the app on the Page is a `POST` to `/{page-id}/subscribed_apps`
   with `subscribed_fields` set to that list and the Page token. Do not put
   the token in a log or in git.
4. **Access.** Meta's webhook prerequisites (updated September 2026) say
   **Standard Access** receives notifications only from people who have a role
   on the app (admin, developer, tester). **Advanced Access** to
   `pages_messaging`, which needs App Review, is required before customers who
   are not app roles show up. Owning the Page does not skip that. Test with an
   app-role account first. The `HUMAN_AGENT` tag is a separate App Review
   permission and is not available on standard access. Leave it off.
5. Click-to-Messenger ads can open a standard window of up to 7 days. This
   inbox treats every thread as 24 hours from the last customer message, which
   is stricter than that ad case. A thread opened only by an ad may lock here
   while Meta would still accept a `RESPONSE`. That is recorded, not guessed
   around.

## Secrets

Set these with `supabase secrets set`, on the project you mean, after the
functions are deployed. Do not prefix them with `VITE_`.

| Secret | Purpose |
|---|---|
| `META_PAGE_ACCESS_TOKEN` | Page token for `POST /{page-id}/messages`. Authorization header only. Redacted from logs. |
| `META_PAGE_ID` | Page id that token belongs to. Sends for any other Page are refused. When set, the webhook also ignores events for other Pages. |
| `MESSENGER_INBOX_ENABLED` | `true` to ingest and send. Anything else, including unset: the webhook returns 200 and writes nothing; staff send returns 403. |
| `MESSENGER_HUMAN_AGENT_ENABLED` | `true` allows a **person-typed** reply to use the `HUMAN_AGENT` tag inside 7 days and outside 24 hours. Default off. The AI cannot use it even when this is on. |
| `MESSENGER_SEND_ALLOWED_ORIGINS` | Optional. Same shape as `WHATSAPP_SEND_ALLOWED_ORIGINS`. |

`META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` are the ones the WhatsApp
webhook already uses.

The staff app reads `VITE_MESSENGER_INBOX_ENABLED=true` at **build** time.
Set it in Vercel and redeploy after the migration is on the database the app
talks to. Until then the inbox query does not select the new columns, so a
frontend deploy before the migration does not break WhatsApp. There is a
matching `VITE_MESSENGER_HUMAN_AGENT_ENABLED` for the 7-day countdown. Leave
it unset.

Edge secrets are read when the request runs. If a function was booted with the
old value cached, redeploy that function after changing the secret.

## Migration

File: `supabase/migrations/20261102150000_messenger_channel.sql`.

Apply it by hand to the intended project **before** setting
`MESSENGER_INBOX_ENABLED=true`. Follow [migrations.md](migrations.md). Do not
assume a merge applies it. The production path is the approval-gated
**Apply named migrations to production** workflow. This change does not run
that workflow.

Order that keeps production quiet:

1. Merge and deploy with both flags unset. The new functions answer and do nothing.
2. Subscribe the Page webhook. Meta gets 200 and no rows are written.
3. Apply the migration.
4. Set `META_PAGE_ACCESS_TOKEN` and `META_PAGE_ID`.
5. Set `VITE_MESSENGER_INBOX_ENABLED=true` and redeploy the staff app.
6. Set `MESSENGER_INBOX_ENABLED=true`.

To stop it, set `MESSENGER_INBOX_ENABLED` back to anything but `true`. Existing
rows stay. Do not set `phone_e164` back to `NOT NULL` while a Messenger row
exists. The migration comment has a rollback for the case where no Messenger
row has been written.

## Behaviour staff will see

- A **Messenger** badge on the thread, and a Messenger filter in the list,
  only when the Vite flag is on.
- The compose box says **Reply window closes in X** while the 24-hour window
  is open, and locks with an explanation when it has closed. There is no
  template picker on a Messenger thread.
- Text is limited to 2,000 characters.
- **Link to customer** searches by name. Picking a person stores the link. It
  does not copy their phone onto the thread.
- A reply typed in Meta Business Suite arrives once, as an echo, not as a
  second copy of a reply sent from this inbox.
- Delivery and read receipts update the outbound row when the mid or the
  watermark matches.

## Known limits

- The booking agent does not draft Messenger messages on its own. Generate
  reply still only fills the box.
- Attachments are labelled (`[image]`, `[video]`, `[audio]`, `[file]`) and the
  URL Meta sent is kept on the message. They are not downloaded into storage.
- Instagram messaging is not included.
- `HUMAN_AGENT` is implemented and tested, and switched off.
