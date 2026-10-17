set local lock_timeout = '5s';

-- WhatsApp opt-out follow-ups: the four gaps deferred from #1016's review
-- (migration 20261014120000, applied in production and never edited).
--
--  G1. merge_humans kept the winner's opt-out reason when both records were
--      opted out, so merging a record that said STOP into one opted out for
--      another reason lost the STOP label: staff could then override the
--      opt-out, and an ordinary untick could pass. A STOP label on either
--      record now survives the merge, with the earliest STOP time.
--  G2. humans_guard_whatsapp_reenable also refuses an untick of a record
--      linked to a conversation that is stopped now. Refusal only: a link
--      never FLAGS a record, because links go stale. The audited re-enable
--      passes through its setting as before.
--  G3. A STOP is applied through apply_whatsapp_stop, which records the Meta
--      message id in whatsapp_stop_applications in the same transaction as
--      the number's stamp. A replayed event whose STOP was already applied is
--      never applied again, so it cannot undo a re-enable staff made since.
--      There is deliberately no comparison with the re-enable time: that
--      would lose a genuine STOP still in flight (supabase/tests/246).
--  G4. A re-enable supersedes any pending STOP acknowledgement left on the
--      re-enabled conversations, by a trigger that fires inside
--      staff_reenable_whatsapp_number's own update of the conversations (so
--      in its transaction, under its locks). That function is not changed.
--
-- Expand-only, idempotent and drop-free. merge_humans is copied unchanged
-- from 20261001160000 apart from the two new branches; its removal of the
-- losing record is part of that copied body.

-- ── G1. A merge keeps a STOP label from either record ───────
create or replace function public.merge_humans(p_winner uuid, p_loser uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.humans%rowtype;
begin
  if not public.is_staff() then
    raise exception 'merge_humans: staff only';
  end if;
  if p_winner is null or p_loser is null then
    raise exception 'merge_humans: winner and loser are required';
  end if;
  if p_winner = p_loser then
    raise exception 'merge_humans: winner and loser must differ';
  end if;

  -- Lock both people first, in UUID order. Customer dog creation/editing and
  -- signup approval take the same owner-row lock before touching dogs.
  perform h.id
  from public.humans h
  where h.id = any(array[p_winner, p_loser])
  order by h.id
  for update;

  select * into l
  from public.humans
  where id = p_loser;
  if not found then
    raise exception 'merge_humans: loser % not found', p_loser;
  end if;
  if not exists (select 1 from public.humans where id = p_winner) then
    raise exception 'merge_humans: winner % not found', p_winner;
  end if;

  -- Cancellation takes booking rows before their dog rows. Lock every booking
  -- that either belongs to a loser-owned dog or directly names the loser as
  -- collector, then lock the loser-owned dogs in UUID order.
  perform b.id
  from public.bookings b
  left join public.dogs d on d.id = b.dog_id
  where b.pickup_by_id = p_loser
     or d.human_id = p_loser
  order by b.id
  for update of b;

  perform d.id
  from public.dogs d
  where d.human_id = p_loser
  order by d.id
  for update of d;

  -- Reassign references from loser -> winner before deleting the loser. The
  -- booking and dog mutations follow the same order as the locks above.
  update public.bookings
  set pickup_by_id = p_winner
  where pickup_by_id = p_loser;

  update public.dogs
  set human_id = p_winner
  where human_id = p_loser;

  update public.waitlist_entries
  set human_id = p_winner
  where human_id = p_loser;

  update public.whatsapp_conversations
  set human_id = p_winner
  where human_id = p_loser;

  update public.notification_log
  set human_id = p_winner
  where human_id = p_loser;

  update public.human_trusted_contacts t
  set human_id = p_winner
  where t.human_id = p_loser
    and t.trusted_id <> p_winner
    and not exists (
      select 1
      from public.human_trusted_contacts e
      where e.human_id = p_winner
        and e.trusted_id = t.trusted_id
    );

  update public.human_trusted_contacts t
  set trusted_id = p_winner
  where t.trusted_id = p_loser
    and t.human_id <> p_winner
    and not exists (
      select 1
      from public.human_trusted_contacts e
      where e.human_id = t.human_id
        and e.trusted_id = p_winner
    );

  -- Deletion frees the unique phone and intentionally removes the loser's
  -- private calendar tokens plus any remaining duplicate trusted links.
  -- Keep customer cancellation history on the surviving file. The audit
  -- trigger records the former owner; a unique conflict aborts the entire merge.
  update smarter_dog_private.late_cancellation_history
    set human_id=p_winner where human_id=p_loser;
  delete from public.humans where id = p_loser;

  update public.humans w
  set phone = coalesce(nullif(w.phone, ''), l.phone),
      email = coalesce(nullif(w.email, ''), l.email),
      address = case
        when coalesce(w.address, '') = '' then l.address else w.address
      end,
      fb = case when coalesce(w.fb, '') = '' then l.fb else w.fb end,
      insta = case when coalesce(w.insta, '') = '' then l.insta else w.insta end,
      tiktok = case when coalesce(w.tiktok, '') = '' then l.tiktok else w.tiktok end,
      history_flag = case
        when coalesce(w.history_flag, '') = '' then l.history_flag
        else w.history_flag
      end,
      notes = case
        when coalesce(l.notes, '') = '' then w.notes
        when coalesce(w.notes, '') = '' then l.notes
        else w.notes || E'\n\n' || l.notes
      end,
      sms = w.sms or l.sms,
      whatsapp = w.whatsapp or l.whatsapp,
      -- Channel setup is additive, but an explicit opt-out is a hard
      -- suppression. Keep each timestamp/reason pair from one source record so
      -- two separate opt-out events cannot be presented as one audit event.
      sms_opted_out = w.sms_opted_out or l.sms_opted_out,
      sms_opted_out_at = case
        when w.sms_opted_out and (
          w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
        ) then w.sms_opted_out_at
        when l.sms_opted_out then l.sms_opted_out_at
        when w.sms_opted_out then w.sms_opted_out_at
        when w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
          then w.sms_opted_out_at
        else l.sms_opted_out_at
      end,
      sms_opted_out_reason = case
        when w.sms_opted_out and (
          w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
        ) then w.sms_opted_out_reason
        when l.sms_opted_out then l.sms_opted_out_reason
        when w.sms_opted_out then w.sms_opted_out_reason
        when w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
          then w.sms_opted_out_reason
        else l.sms_opted_out_reason
      end,
      whatsapp_opted_out = w.whatsapp_opted_out or l.whatsapp_opted_out,
      whatsapp_opted_out_at = case
        when (w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          or (l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          then coalesce(
            least(
              case when w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp' then w.whatsapp_opted_out_at end,
              case when l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp' then l.whatsapp_opted_out_at end),
            w.whatsapp_opted_out_at, l.whatsapp_opted_out_at, now())
        when w.whatsapp_opted_out and (
          w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
        ) then w.whatsapp_opted_out_at
        when l.whatsapp_opted_out then l.whatsapp_opted_out_at
        when w.whatsapp_opted_out then w.whatsapp_opted_out_at
        when w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
          then w.whatsapp_opted_out_at
        else l.whatsapp_opted_out_at
      end,
      whatsapp_opted_out_reason = case
        when (w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          or (l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          then 'asked_on_whatsapp'
        when w.whatsapp_opted_out and (
          w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
        ) then w.whatsapp_opted_out_reason
        when l.whatsapp_opted_out then l.whatsapp_opted_out_reason
        when w.whatsapp_opted_out then w.whatsapp_opted_out_reason
        when w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
          then w.whatsapp_opted_out_reason
        else l.whatsapp_opted_out_reason
      end,
      email_opted_out = w.email_opted_out or l.email_opted_out,
      email_opted_out_at = case
        when w.email_opted_out and (
          w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
        ) then w.email_opted_out_at
        when l.email_opted_out then l.email_opted_out_at
        when w.email_opted_out then w.email_opted_out_at
        when w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
          then w.email_opted_out_at
        else l.email_opted_out_at
      end,
      email_opted_out_reason = case
        when w.email_opted_out and (
          w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
        ) then w.email_opted_out_reason
        when l.email_opted_out then l.email_opted_out_reason
        when w.email_opted_out then w.email_opted_out_reason
        when w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
          then w.email_opted_out_reason
        else l.email_opted_out_reason
      end
  where w.id = p_winner;
end;
$$;

comment on function public.merge_humans(uuid, uuid) is
  'Staff-only. Reassigns every reference from the loser human to the winner using deterministic human, booking and dog locks, backfills blank contact fields, then deletes the loser. A STOP label on either record is kept (20261016120000).';

revoke all on function public.merge_humans(uuid, uuid) from public;
revoke all on function public.merge_humans(uuid, uuid) from anon;
revoke all on function public.merge_humans(uuid, uuid) from authenticated;
grant execute on function public.merge_humans(uuid, uuid) to authenticated;

-- ── G2. An untick is refused while a linked conversation is stopped ─
create or replace function public.humans_guard_whatsapp_reenable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if coalesce(current_setting('smarter_dog.whatsapp_reenable', true), '') = 'on' then
    return new;
  end if;
  if old.whatsapp_opted_out_reason is not distinct from 'asked_on_whatsapp' then
    raise exception 'This customer asked on WhatsApp for messages to stop. Switch WhatsApp back on with their renewed permission instead.'
      using errcode = 'P0001', detail = 'whatsapp_reenable_needs_permission';
  end if;
  -- From here on it is an untick of an opt-out with another reason.
  -- Both numbers: the one the record had, and the one it is saved with.
  foreach v_key in array array[public.whatsapp_phone_key(old.phone), public.whatsapp_phone_key(new.phone)] loop
    continue when v_key is null;
    if exists (
      select 1 from public.whatsapp_conversations c
       where c.channel = 'whatsapp'
         and c.whatsapp_opted_out_at is not null
         and public.whatsapp_phone_key(c.phone_e164) = v_key
    ) then
      raise exception 'This number asked on WhatsApp for messages to stop. Switch WhatsApp back on with the customer''s renewed permission instead.'
        using errcode = 'P0001', detail = 'whatsapp_reenable_needs_permission';
    end if;
  end loop;
  -- Linked to a conversation that is stopped now: refuse only. A link never
  -- FLAGS a record (links go stale, #1016); the audited re-enable passes
  -- through the setting checked above.
  if exists (
    select 1 from public.whatsapp_conversations c
     where c.human_id = old.id
       and c.channel = 'whatsapp'
       and c.whatsapp_opted_out_at is not null
  ) then
    raise exception 'This customer''s WhatsApp conversation asked for messages to stop. Switch WhatsApp back on for that number with the customer''s renewed permission instead.'
      using errcode = 'P0001', detail = 'whatsapp_reenable_needs_permission';
  end if;
  return new;
end;
$$;

revoke all on function public.humans_guard_whatsapp_reenable() from public;
revoke all on function public.humans_guard_whatsapp_reenable() from anon;
revoke all on function public.humans_guard_whatsapp_reenable() from authenticated;

-- ── G3. A STOP is applied once per Meta message ─────────────
create table if not exists public.whatsapp_stop_applications (
  meta_message_id text primary key,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  applied_at timestamptz not null default now());
create index if not exists whatsapp_stop_applications_conversation_id_idx on public.whatsapp_stop_applications (conversation_id);
alter table public.whatsapp_stop_applications enable row level security;

revoke all on table public.whatsapp_stop_applications from public;
revoke all on table public.whatsapp_stop_applications from anon;
revoke all on table public.whatsapp_stop_applications from authenticated;
-- No policy: only apply_whatsapp_stop (a definer function) writes it, and
-- service_role bypasses RLS.

comment on table public.whatsapp_stop_applications is
  'One row per Meta message whose STOP has been applied to its conversation. Written only by apply_whatsapp_stop, in the same transaction as the stamp, so a replayed event never applies the same STOP twice (20261016120000).';

create or replace function public.apply_whatsapp_stop(p_conversation_id uuid, p_meta_message_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marked boolean;
  v_at timestamptz;
begin
  if p_conversation_id is null
     or not exists (select 1 from public.whatsapp_conversations where id = p_conversation_id) then
    raise exception 'Unknown conversation' using errcode = 'P0001', detail = 'invalid_conversation';
  end if;
  v_marked := true;
  -- No Meta id (or a blank one): nothing to de-duplicate on, so it applies.
  if nullif(btrim(p_meta_message_id), '') is not null then
    insert into public.whatsapp_stop_applications (meta_message_id, conversation_id)
    values (p_meta_message_id, p_conversation_id)
    on conflict (meta_message_id) do nothing;
    v_marked := found;
  end if;
  if not v_marked then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;
  -- By id alone, unfiltered, as the agent wrote it before: a STOP landing
  -- while staff re-enable the number waits and then stops it again
  -- (supabase/tests/246). The guard and apply triggers fire as before; the
  -- apply trigger flags the number's customer records in this transaction.
  update public.whatsapp_conversations
     set whatsapp_opted_out_at = now(),
         auto_send_enabled = false
   where id = p_conversation_id
  returning whatsapp_opted_out_at into v_at;
  if not found then
    raise exception 'Unknown conversation' using errcode = 'P0001', detail = 'invalid_conversation';
  end if;
  return jsonb_build_object('applied', true, 'whatsapp_opted_out_at', v_at);
end;
$$;

revoke all on function public.apply_whatsapp_stop(uuid, text) from public;
revoke all on function public.apply_whatsapp_stop(uuid, text) from anon;
revoke all on function public.apply_whatsapp_stop(uuid, text) from authenticated;
grant execute on function public.apply_whatsapp_stop(uuid, text) to service_role;

-- ── G4. A re-enable supersedes the leftover acknowledgement ──
-- Only the audited re-enable can clear whatsapp_opted_out_at
-- (trg_whatsapp_conversation_guard_stop refuses it otherwise), so this fires
-- exactly on a re-enable, inside its transaction.
create or replace function public.whatsapp_conversation_supersede_stop_acks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.whatsapp_drafts d set state = 'superseded', rejected_reason = 'whatsapp_reenabled'
   where d.conversation_id = new.id and d.state = 'pending'
     and (d.tool_calls ->> 'opt_out_acknowledgement') = 'true';
  return null;
end;
$$;

revoke all on function public.whatsapp_conversation_supersede_stop_acks() from public;
revoke all on function public.whatsapp_conversation_supersede_stop_acks() from anon;
revoke all on function public.whatsapp_conversation_supersede_stop_acks() from authenticated;

create or replace trigger trg_whatsapp_conversation_supersede_stop_acks
  after update of whatsapp_opted_out_at on public.whatsapp_conversations
  for each row
  when (old.whatsapp_opted_out_at is not null and new.whatsapp_opted_out_at is null)
  execute function public.whatsapp_conversation_supersede_stop_acks();
