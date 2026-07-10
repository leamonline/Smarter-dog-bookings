-- ============================================================
-- salon_config.pricing: "£42" strings → integer pence  (review Phase 6)
--
-- Money stored as display text can only be regex-parsed; every reader now
-- goes through the shared money helpers instead. Values become INTEGER
-- PENCE ("£42" → 4200); "N/A" and empty strings become JSON null (size not
-- offered). Keys are untouched (including the non-bookable walk-in
-- "nail-trim" entry).
--
-- Deploy order is safe in BOTH directions: the app and the WhatsApp Flow
-- endpoint shipped tolerant readers (string OR pence) before this runs.
--
-- Idempotent: only string values are converted; a re-run finds numbers and
-- leaves them alone. Unrecognisable strings are left as-is (readers treat
-- them as "no price" and fall back to the built-in guide).
-- ============================================================

update public.salon_config
set pricing = (
  select coalesce(jsonb_object_agg(svc.key, sizes.converted), '{}'::jsonb)
  from jsonb_each(pricing) as svc
  cross join lateral (
    select jsonb_object_agg(
      sz.key,
      case
        when jsonb_typeof(sz.value) = 'string' then
          case
            when upper(coalesce(sz.value #>> '{}', '')) in ('N/A', '') then 'null'::jsonb
            when (sz.value #>> '{}') ~ '^£?[0-9]+(\.[0-9]{1,2})?\+?$' then
              to_jsonb(round((regexp_replace(sz.value #>> '{}', '[£+]', '', 'g'))::numeric * 100)::int)
            else sz.value
          end
        else sz.value
      end
    ) as converted
    from jsonb_each(svc.value) as sz
  ) as sizes
)
where pricing is not null
  and jsonb_typeof(pricing) = 'object'
  -- Only rows that still contain at least one string price (idempotency).
  and exists (
    select 1
    from jsonb_each(pricing) as svc2
    cross join lateral jsonb_each(svc2.value) as sz2
    where jsonb_typeof(sz2.value) = 'string'
  );

comment on column public.salon_config.pricing is
  'Guide ("from") prices per service+size in INTEGER PENCE (4200 = £42); null = size not offered. Read by the app''s price precedence (after custom/override prices) and the WhatsApp Flow endpoint (display). Converted from "£42" strings 2026-07-10.';
