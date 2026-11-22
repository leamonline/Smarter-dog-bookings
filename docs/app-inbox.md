# In-app messages

**Status:** Active
**Authority:** The migration `20261122170000_app_messaging.sql` and the functions it creates. If this page and the database disagree, the database is what customers experience.

Messages typed in the iPhone app are a separate conversation from WhatsApp. Staff see both in the same inbox once the switch below is on. A customer who does not have the app is unchanged: they still write and receive messages on WhatsApp.

The website inbox does not show or send app messages unless the site was built with `VITE_APP_INBOX_ENABLED=1`. Leave that unset until this migration has been applied on the Supabase project that build talks to. If the switch is on and the migration is not there yet, the inbox stays on WhatsApp and logs a warning.

## What staff see

With the switch off, the inbox is the WhatsApp inbox it is today.

With the switch on:

- A customer who has both is one row. The row is marked with the channels they use, for example “WhatsApp · App”. If their text thread still has an unread message, a draft, a failed send or a booking proposal, that row stays too, so the thing that needs doing is not hidden. That row still knows about the app, so a reply from it follows the same channel rule below.
- Opening that row shows both sets of messages, each marked WhatsApp, SMS or App.
- If the customer’s latest message was in the app, the reply box says “This reply goes to their app, not WhatsApp.” Sending stores an app message. It does not call WhatsApp. The box stays disabled until the inbox has checked which channel the reply belongs on.
- If their latest message was on WhatsApp, the reply still goes out on WhatsApp, including the usual 24-hour window and templates. Retry on a failed WhatsApp message still retries WhatsApp, through the conversation that sent it. A failed message from another of the customer's numbers has no Retry in this thread. It says to open that conversation, which stays in the list while it has a failed send. A suggested WhatsApp reply stays a WhatsApp send, and the button says so when the box below is replying in the app.
- A customer who only has the app appears as their own row. There is no WhatsApp template step.
- A WhatsApp chat that was marked done comes back into the active list when a newer app message arrives. The WhatsApp chat itself is not reopened.
- A WhatsApp number that is not linked to a customer stays its own WhatsApp thread.
- Closing a conversation is still the WhatsApp action. An app-only row is not closed from that button.

## What a customer can do

A signed-in customer can read only the conversation linked to their own customer record, and can send on that conversation. They cannot see anyone else’s messages, and they cannot type straight into the tables. Sending and marking read go through the functions below.

The iPhone app does not call these yet. Sign-in is separate work. This page is the contract that app will use.

## How to try it on staging

Do not apply this migration to the live salon database as part of reviewing the change. Staging first.

1. Apply `supabase/migrations/20261122170000_app_messaging.sql` to the **staging** Supabase project, the same way other migrations are applied there. Do not apply it to production until you have decided to ship it. Merging to `main` does not apply database migrations, and this pull request cannot merge until production has the same file, because of the migrations check. That production apply is a separate step you approve.
2. Build or preview the website with `VITE_APP_INBOX_ENABLED=1`. A normal production build leaves the variable unset, so the live inbox does not change when the code is only deployed.
3. Sign in as staff. Open the inbox. WhatsApp threads should look as they do now, until an app message exists.
4. As a test customer who is linked to a login, send an app message with the function below (the iPhone screen is not built yet; the Supabase SQL editor, signed in as that customer, is enough). The staff inbox, with the switch on, should show it marked App. A reply from staff should come back on that same conversation, not as a WhatsApp message.
5. A customer with no app message should still receive WhatsApp exactly as before.

Push notifications for these messages are not included. A later change can notify the phone. Nothing here sends one.

## Functions

All of these run as the signed-in user. `authenticated` may call them. `anon` may not.

| Function | Who | What it does |
|---|---|---|
| `send_app_message(p_body text, p_human_id uuid default null)` | Customer or staff | Stores one message, at most 2,000 characters. A customer’s human id is ignored and the message is filed on their own record. Staff must pass the customer’s human id. |
| `mark_app_messages_read(p_conversation_id uuid)` | Customer or staff | Staff mark the customer’s messages read. A customer marks staff messages read, and only on their own conversation. |
| `list_staff_unified_inbox()` | Staff | One row per customer, with `channels` of `whatsapp`, `sms` and/or `app`, plus a row for each WhatsApp number with no customer. |
| `list_staff_unified_thread(p_human_id uuid, p_whatsapp_conversation_id uuid)` | Staff | The messages, oldest first, latest 200, each with a `channel`. |

Customers read their own rows from `app_conversations` and `app_messages`. Row security allows that select and no other customer’s rows. Insert and update are not granted; the functions do the writing. Both tables are on the realtime publication.

An app send does not insert a WhatsApp message, does not call the WhatsApp sender, and does not change opt-out.

## Rollback

On staging, if no real customer thread needs keeping: drop `app_messages` and `app_conversations`, then drop the four functions. Turn the website switch off. The WhatsApp inbox does not read these tables while the switch is off, so dropping them does not change WhatsApp.

Plan: [2026-11-22-app-inbox.md](plans/active/2026-11-22-app-inbox.md).
