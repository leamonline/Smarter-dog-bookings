-- 032_whatsapp_last_outbound_at.sql
--
-- Keep whatsapp_conversations.last_outbound_at trustworthy so dashboard
-- "awaiting reply" can mean: last inbound customer message is newer than
-- our last outbound reply.

create or replace function sync_whatsapp_conversation_last_outbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'outbound' then
    update whatsapp_conversations
       set last_outbound_at = case
         when last_outbound_at is null or new.sent_at > last_outbound_at then new.sent_at
         else last_outbound_at
       end
     where id = new.conversation_id;
  end if;

  return new;
end;
$$;

comment on function sync_whatsapp_conversation_last_outbound() is
  'AFTER INSERT trigger function on whatsapp_messages. Maintains whatsapp_conversations.last_outbound_at from outbound messages.';

drop trigger if exists whatsapp_messages_sync_last_outbound on whatsapp_messages;

create trigger whatsapp_messages_sync_last_outbound
  after insert on whatsapp_messages
  for each row
  execute function sync_whatsapp_conversation_last_outbound();

update whatsapp_conversations c
   set last_outbound_at = sub.last_outbound_at
  from (
    select conversation_id, max(sent_at) as last_outbound_at
      from whatsapp_messages
     where direction = 'outbound'
     group by conversation_id
  ) sub
 where c.id = sub.conversation_id
   and (c.last_outbound_at is null or c.last_outbound_at < sub.last_outbound_at);

-- Rollback:
--   drop trigger if exists whatsapp_messages_sync_last_outbound on whatsapp_messages;
--   drop function if exists sync_whatsapp_conversation_last_outbound();
