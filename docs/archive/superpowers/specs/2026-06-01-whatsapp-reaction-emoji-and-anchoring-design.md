# Capture WhatsApp reaction emoji + parent link, and surface them in the inbox

**Status:** proposed
**Date:** 2026-06-01
**Follow-up to:** the inbox thread restyle that rendered reactions as a muted
"Reacted" line (`src/components/views/inbox/thread/ReactionLine.jsx`,
`messageContent.ts`).

## Context

Inbound emoji reactions currently reach the inbox as the string
`[reaction message — no text content]`. The thread now renders that as a tidy
muted "Reacted" line with a neutral icon — but it never shows *which* emoji the
customer sent, nor *which* message they reacted to, because neither value is
surfaced to the renderer.

This spec captures both, stores them as columns, widens the inbox query, and
(optionally) anchors the reaction as a chip on the message it reacts to.

### Correction to an earlier assumption
An earlier note claimed the `[reaction message …]` string came from an external
Make.com flow. **That was wrong.** It is produced in-repo by the generic
fallback in `extractMessageText`
(`supabase/functions/whatsapp-agent/index.ts:2295`):

```ts
if (msg.type) return `[${msg.type} message — no text content]`;
```

A grep for `[reaction` missed it because it's a template literal. The whole
pipeline is ours to change.

## How inbound messages flow today (verified)

1. **`whatsapp-webhook`** — verifies Meta's HMAC and writes the *full* payload to
   `whatsapp_events.payload` (jsonb), `processing_status='pending'`. Touches
   nothing else (`whatsapp-webhook/index.ts`).
2. **pg_net trigger** on `whatsapp_events` (migration `…001657`) POSTs the event
   to `whatsapp-agent`.
3. **`whatsapp-agent`** processes it (`index.ts:1978` loop):
   - `text = extractMessageText(msg)` (`:1987`) — reactions hit the `:2295`
     fallback → `[reaction message — no text content]`.
   - `upsertConversation(…, text)` — also sets `last_customer_text` (the
     conversation-list preview, `ConversationListItem.jsx:69`).
   - `insertInboundMessage(…, text, msg, sentAt)` (`:1997`) inserts the row with
     `content: text` **and `raw: msg`** — the complete Meta message object
     (`:544`).

### Key insight: the data is already stored
Because `insertInboundMessage` persists the entire Meta message in
`whatsapp_messages.raw`, every reaction ever received already contains:

```jsonc
// whatsapp_messages.raw for a reaction
{
  "id": "wamid.AAA…",          // the reaction's own id
  "from": "447700900123",
  "type": "reaction",
  "timestamp": "1717230000",
  "reaction": {
    "message_id": "wamid.BBB…", // ← the message being reacted to
    "emoji": "👍"               // ← the emoji
  }
}
```

So this is mostly a *surfacing* job, not a *capture* job — and historical
reactions can be backfilled from `raw`.

(Quoted text replies use `raw.context.id` for the parent instead of
`raw.reaction.message_id`; we capture both with one column.)

## Goal / non-goals

**Goal**
- Store `reaction_emoji` and `in_reply_to_meta_id` on `whatsapp_messages`.
- Populate them going forward in `whatsapp-agent`, and backfill history from `raw`.
- Widen the inbox select so the renderer receives them.
- Show the actual emoji in the existing `ReactionLine` (Phase 1).
- (Phase 2, optional) Anchor the reaction as a chip on its parent bubble.

**Non-goals**
- Outbound reactions (the salon reacting). Out of scope — inbound only.
- Re-architecting ingestion. We add fields to the existing path.

## Design

Recommended: **structured columns** (what the follow-up asked for).
- Keeps the client query small — we do *not* ship the whole `raw` jsonb to the
  browser.
- Frontend stays trivial: `ReactionLine` already takes an `emoji` prop, and the
  parser already returns `emoji`.
- `in_reply_to_meta_id` matches an existing message's `meta_message_id` (already
  selected), so anchoring needs no extra lookup.

Alternative considered — *read from `raw` on the client*: widen the select to
include `raw` and dig out `raw.reaction.*` in the parser. No migration, but it
ships large payloads and couples the UI to Meta's wire shape. Rejected for the
default path.

---

## Phase 1 — capture + show the emoji (core)

### 1. Migration
`supabase migration new whatsapp_reaction_fields`, then:

```sql
alter table whatsapp_messages
  add column if not exists reaction_emoji      text,
  add column if not exists in_reply_to_meta_id text;

comment on column whatsapp_messages.reaction_emoji is
  'Inbound type=reaction only: the emoji reacted with (raw.reaction.emoji). NULL otherwise.';
comment on column whatsapp_messages.in_reply_to_meta_id is
  'Meta wamid this message references — reaction target (raw.reaction.message_id) '
  'or quoted reply (raw.context.id). Matches another row''s meta_message_id.';

-- Cheap lookups when grouping reactions by their parent.
create index if not exists whatsapp_messages_in_reply_to_idx
  on whatsapp_messages (in_reply_to_meta_id)
  where in_reply_to_meta_id is not null;
```

No RLS/grant change (row-level policies unaffected; same role selects the new
columns). No realtime-publication change — the inbox hook re-runs its select on
each change rather than reading the realtime payload, so new columns flow through
once the select includes them.

### 2. Backfill (recovers all historical reactions from `raw`)

```sql
update whatsapp_messages
   set reaction_emoji      = coalesce(reaction_emoji, raw->'reaction'->>'emoji'),
       in_reply_to_meta_id = coalesce(in_reply_to_meta_id, raw->'reaction'->>'message_id')
 where raw ? 'reaction';

-- Optional: also anchor quoted-text replies.
update whatsapp_messages
   set in_reply_to_meta_id = coalesce(in_reply_to_meta_id, raw->'context'->>'id')
 where raw ? 'context' and in_reply_to_meta_id is null;
```

### 3. `whatsapp-agent/index.ts`

**(a) Extend the `MetaMessage` type** (`:120`):
```ts
interface MetaMessage {
  id?: string; from?: string; type?: string; timestamp?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: {…}; list_reply?: {…} };
  reaction?: { message_id?: string; emoji?: string }; // NEW
  context?: { id?: string; from?: string };           // NEW (quoted replies)
}
```

**(b) Friendlier reaction text** in `extractMessageText` (`:2290`), *before* the
generic fallback — this also fixes the conversation-list preview:
```ts
if (msg.type === "reaction") {
  const emoji = msg.reaction?.emoji?.trim();
  return emoji ? `Reacted ${emoji}` : "Reacted";
}
```

**(c) Populate the columns** in `insertInboundMessage` (`:544`) — derive straight
from the `raw` MetaMessage it already receives (no signature change):
```ts
const { error } = await supabase.from("whatsapp_messages").insert({
  conversation_id: conversationId,
  event_id: eventId,
  direction: "inbound",
  role: "user",
  meta_message_id: metaMsgId,
  content: text,
  raw,
  reaction_emoji: raw.reaction?.emoji ?? null,                               // NEW
  in_reply_to_meta_id: raw.reaction?.message_id ?? raw.context?.id ?? null,  // NEW
  status: "delivered",
  sent_at: sentAt,
});
```

### 4. Widen the inbox select
`src/supabase/hooks/useWhatsAppInbox.js:117`:
```js
.select("id, direction, content, sent_at, status, meta_message_id, channel, reaction_emoji, in_reply_to_meta_id")
```

### 5. Prefer the column emoji in the renderer
`src/components/views/inbox/thread/MessageBubble.jsx` — column first, fall back to
the parsed `[reaction…]` string for any un-backfilled rows (belt and braces):
```jsx
const parsed = parseMessageContent(message.content);
const reactionEmoji =
  message.reaction_emoji ?? (parsed.kind === "reaction" ? parsed.emoji : null);
const isReaction = message.reaction_emoji != null || parsed.kind === "reaction";

if (isReaction) {
  return <ReactionLine message={message} emoji={reactionEmoji} />;
}
```
`ReactionLine` is unchanged — it already shows the emoji when present and the
neutral icon when not.

> Edge case: an emoji-less reaction (rare) yields `content="Reacted"` and a null
> column, so it renders as a normal small bubble reading "Reacted". Acceptable.

**Phase 1 result:** reactions read "Reacted 👍" in the thread *and* in the
conversation-list preview, with zero data loss for history.

---

## Phase 2 — anchor the reaction to its message (optional polish)

Render a reaction as a small chip on the corner of the bubble it reacts to,
instead of a standalone line — falling back to the inline line only when the
parent isn't in the loaded window.

`src/components/views/inbox/InboxView.jsx` thread builder (`:576`):
- Split `messages` into `reactions` (`reaction_emoji != null` or `[reaction…]`)
  and `realMessages`.
- `reactionsByParent = group reactions by in_reply_to_meta_id`.
- `loaded = new Set(realMessages.map(m => m.meta_message_id))`.
- For each real message, pass `reactions={reactionsByParent[m.meta_message_id]}`.
- Reactions whose parent is missing/`null` or not in `loaded` (older than the
  200-row window) stay as standalone `ReactionLine`s — never dropped.

`MessageBubble` gains an optional `reactions` prop and renders a small chip
cluster pinned to the bubble's bottom corner (e.g. `relative` bubble + an
`absolute -bottom-2` chip with `text-[11px]` emoji on a `bg-white border
border-slate-200 rounded-full shadow-sm` pill — reuse existing tokens). Multiple
reactions stack/merge.

This is genuinely more involved (grouping + positioning + the not-loaded
fallback), so it's separable from Phase 1 and can ship later.

## Tests

- **Edge (whatsapp-agent):** export `extractMessageText` and unit-test the
  reaction case (`type:"reaction"` + emoji → "Reacted 👍"; no emoji → "Reacted").
  Assert the `insertInboundMessage` payload derives `reaction_emoji` /
  `in_reply_to_meta_id` from `raw` (small Deno test, or factor the derivation into
  a pure helper and test it like `messageContent.ts`).
- **Frontend:** extend `MessageBubble.component.test.jsx` — a message with
  `reaction_emoji:"❤️"` and arbitrary content renders ❤️ via `ReactionLine`
  (column wins over content); existing `[reaction…]`-string test still passes.
- `messageContent.test.ts` already covers string parsing.

## Verification

1. `supabase migration up` (or `supabase db reset`) locally.
2. Replay a reaction webhook (webhook local harness in `whatsapp-webhook/index.ts`,
   or insert a `whatsapp_events` row with a `type:"reaction"` payload to fire the
   trigger). Confirm the new `whatsapp_messages` row has `reaction_emoji` and
   `in_reply_to_meta_id` set, and `content = "Reacted 👍"`.
3. Run the backfill on a DB copy; confirm historical reactions populate.
4. Open the inbox: reaction reads "Reacted 👍" in thread + list preview; with
   Phase 2, a chip sits on the parent bubble; a reaction to a message outside the
   loaded window still shows the inline fallback.
5. `npm test` green; `npx tsc --noEmit` clean.

## Risks / notes

- Payload shape is Meta's: parent is `reaction.message_id` for reactions,
  `context.id` for quoted replies — both captured.
- Adding nullable columns is non-breaking; older inserts simply leave them null
  until backfilled.
- The 200-message thread window means very old parents may be unloaded → Phase 2
  falls back to the inline line (no loss).
- No generated DB types file in the repo, so nothing to regenerate.
```
