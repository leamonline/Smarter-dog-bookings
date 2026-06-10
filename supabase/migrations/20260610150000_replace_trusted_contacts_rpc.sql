-- ============================================================
-- replace_trusted_contacts(p_human_id, p_contacts)
--
-- Atomically replaces a human's trusted-contact links. The dashboard
-- previously issued the clearing DELETE and the replacement INSERT as
-- two separate statements from the client; if the insert failed after
-- the delete had committed (network blip, constraint, RLS), every
-- trusted link the human had was permanently lost while the UI rolled
-- back and looked fine. One function call = one transaction: either
-- the full new set lands or nothing changes.
--
-- p_contacts: jsonb array of { "trusted_id": "<uuid>", "relationship": "..." }.
-- An empty array clears all links (same as the old behaviour).
--
-- The table's own constraints keep doing the real validation — the
-- (human_id, trusted_id) primary key, the human_id <> trusted_id check
-- and the humans(id) FKs all abort the whole function on violation,
-- leaving the previous links untouched.
--
-- security definer + is_staff() gate, mirroring merge_humans. No RLS
-- policies are modified.
-- ============================================================

create or replace function public.replace_trusted_contacts(
  p_human_id uuid,
  p_contacts jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'replace_trusted_contacts: staff only';
  end if;
  if p_human_id is null then
    raise exception 'replace_trusted_contacts: human id is required';
  end if;
  if not exists (select 1 from humans where id = p_human_id) then
    raise exception 'replace_trusted_contacts: human % not found', p_human_id;
  end if;
  if p_contacts is null or jsonb_typeof(p_contacts) <> 'array' then
    raise exception 'replace_trusted_contacts: p_contacts must be a json array';
  end if;

  delete from human_trusted_contacts where human_id = p_human_id;

  insert into human_trusted_contacts (human_id, trusted_id, relationship)
  select
    p_human_id,
    (entry->>'trusted_id')::uuid,
    nullif(trim(entry->>'relationship'), '')
  from jsonb_array_elements(p_contacts) as entry;
end;
$$;

comment on function public.replace_trusted_contacts(uuid, jsonb) is
  'Staff-only. Atomically replaces every trusted-contact link for a human (delete + insert in one transaction), so a failed insert can no longer leave the human with zero links. Empty array clears all links.';

-- New public functions auto-grant EXECUTE to PUBLIC (and therefore anon);
-- revoking PUBLIC alone leaves anon's direct grant, so revoke it explicitly.
revoke all on function public.replace_trusted_contacts(uuid, jsonb) from public;
revoke all on function public.replace_trusted_contacts(uuid, jsonb) from anon;
grant execute on function public.replace_trusted_contacts(uuid, jsonb) to authenticated;
