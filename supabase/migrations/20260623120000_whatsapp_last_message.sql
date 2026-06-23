-- Maintain a "last message (either direction)" snapshot on
-- whatsapp_conversations so the inbox list can preview the latest message
-- (ours OR the customer's) and align it by direction. Mirrors the existing
-- last_outbound_at trigger (20260427145146). Idempotent — safe to re-run.

alter table whatsapp_conversations
  add column if not exists last_message_text text,
  add column if not exists last_message_direction text,
  add column if not exists last_message_at timestamptz;

create or replace function sync_whatsapp_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only advance when this message is at least as new as the current
  -- snapshot, so a late-arriving older insert can't clobber the latest.
  update whatsapp_conversations
     set last_message_text = new.content,
         last_message_direction = new.direction,
         last_message_at = new.sent_at
   where id = new.conversation_id
     and (last_message_at is null or new.sent_at >= last_message_at);
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_last_message on whatsapp_messages;
create trigger trg_whatsapp_last_message
after insert on whatsapp_messages
for each row
execute function sync_whatsapp_conversation_last_message();

-- Backfill from the newest message per conversation.
update whatsapp_conversations c
   set last_message_text = m.content,
       last_message_direction = m.direction,
       last_message_at = m.sent_at
  from (
    select distinct on (conversation_id)
           conversation_id, content, direction, sent_at
      from whatsapp_messages
     order by conversation_id, sent_at desc, id desc
  ) m
 where m.conversation_id = c.id;
