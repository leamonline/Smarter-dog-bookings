-- ============================================================
-- merge_humans(p_winner, p_loser)
--
-- Merges the "loser" human record into the "winner". Every row that
-- references the loser is reassigned to the winner, the winner's blank
-- contact fields are backfilled from the loser, and the loser row is
-- deleted — all inside one function call (one transaction) so a merge can
-- never half-apply.
--
-- FK landscape on humans(id), handled below:
--   dogs.human_id                  cascade   -> reassign (keep the dogs)
--   bookings.pickup_by_id          no action -> reassign (else delete blocks)
--   human_trusted_contacts.*       cascade   -> reassign each side, dedup
--   waitlist_entries.human_id      cascade   -> reassign
--   whatsapp_conversations.human_id set null -> reassign (keep the thread)
--   notification_log.human_id      set null  -> reassign (keep the history)
--   calendar_feed_tokens.human_id  cascade   -> NOT reassigned; the loser's
--                                               private feed URL dies with it
--
-- Ordering matters: humans has a partial UNIQUE index on phone, so the
-- loser must be deleted BEFORE the winner's phone is backfilled, otherwise
-- the two rows momentarily share a phone and the index rejects it. We
-- snapshot the loser row first, reassign, delete, then backfill.
--
-- security definer so the reassignments bypass per-table RLS, but gated to
-- staff via is_staff() so customers can't invoke it.
-- ============================================================

create or replace function public.merge_humans(p_winner uuid, p_loser uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l humans%rowtype;
begin
  if not is_staff() then
    raise exception 'merge_humans: staff only';
  end if;
  if p_winner is null or p_loser is null then
    raise exception 'merge_humans: winner and loser are required';
  end if;
  if p_winner = p_loser then
    raise exception 'merge_humans: winner and loser must differ';
  end if;

  select * into l from humans where id = p_loser;
  if not found then
    raise exception 'merge_humans: loser % not found', p_loser;
  end if;
  if not exists (select 1 from humans where id = p_winner) then
    raise exception 'merge_humans: winner % not found', p_winner;
  end if;

  -- Reassign references from loser -> winner (before the delete so the
  -- cascade FKs don't take the rows with them).
  update dogs                  set human_id     = p_winner where human_id     = p_loser;
  update bookings              set pickup_by_id = p_winner where pickup_by_id = p_loser;
  update waitlist_entries      set human_id     = p_winner where human_id     = p_loser;
  update whatsapp_conversations set human_id    = p_winner where human_id     = p_loser;
  update notification_log      set human_id     = p_winner where human_id     = p_loser;

  -- Trusted-contact links (PK is (human_id, trusted_id)): reassign each
  -- side, skipping rows that would self-reference or duplicate an existing
  -- link. Any leftover loser rows cascade-delete with the loser below.
  update human_trusted_contacts t set human_id = p_winner
    where t.human_id = p_loser
      and t.trusted_id <> p_winner
      and not exists (
        select 1 from human_trusted_contacts e
        where e.human_id = p_winner and e.trusted_id = t.trusted_id
      );
  update human_trusted_contacts t set trusted_id = p_winner
    where t.trusted_id = p_loser
      and t.human_id <> p_winner
      and not exists (
        select 1 from human_trusted_contacts e
        where e.human_id = t.human_id and e.trusted_id = p_winner
      );

  -- Remove the loser now (frees the unique phone, drops calendar tokens and
  -- any remaining duplicate trusted-contact rows via cascade).
  delete from humans where id = p_loser;

  -- Backfill the winner's blank contact fields from the snapshot. The
  -- winner's own values always win; booleans OR together; notes concat.
  update humans w set
    phone        = coalesce(nullif(w.phone, ''), l.phone),
    email        = coalesce(nullif(w.email, ''), l.email),
    address      = case when coalesce(w.address, '')      = '' then l.address      else w.address      end,
    fb           = case when coalesce(w.fb, '')           = '' then l.fb           else w.fb           end,
    insta        = case when coalesce(w.insta, '')        = '' then l.insta        else w.insta        end,
    tiktok       = case when coalesce(w.tiktok, '')       = '' then l.tiktok       else w.tiktok       end,
    history_flag = case when coalesce(w.history_flag, '') = '' then l.history_flag else w.history_flag end,
    notes        = case
                     when coalesce(l.notes, '') = '' then w.notes
                     when coalesce(w.notes, '') = '' then l.notes
                     else w.notes || E'\n\n' || l.notes
                   end,
    sms          = w.sms or l.sms,
    whatsapp     = w.whatsapp or l.whatsapp
  where w.id = p_winner;
end;
$$;

comment on function public.merge_humans(uuid, uuid) is
  'Staff-only. Reassigns every reference (dogs, booking pickups, trusted contacts, waitlist, conversations, notifications) from the loser human to the winner, backfills the winner''s blank contact fields, then deletes the loser. Security definer to bypass RLS during reassignment; calendar feed tokens are intentionally dropped with the loser.';

-- New public functions auto-grant EXECUTE to PUBLIC (and therefore anon);
-- revoking PUBLIC alone leaves anon's direct grant, so revoke it explicitly.
revoke all on function public.merge_humans(uuid, uuid) from public;
revoke all on function public.merge_humans(uuid, uuid) from anon;
grant execute on function public.merge_humans(uuid, uuid) to authenticated;
