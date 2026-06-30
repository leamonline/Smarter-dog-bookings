-- ============================================================
-- Day-closure broadcast: tighten the day_closure_v1 template body + add a
-- Meta `example`.
--
-- The template seeded by 20260627170000 was never submitted to Meta (meta_id is
-- null), so there is no version to preserve — we just rewrite this row's body to
-- the tightened wording and attach an example (the single biggest lever on Meta
-- approval odds). status stays 'pending'; whatsapp-admin's create_template reads
-- THIS row and POSTs {name, language, category, components} to Meta, so the row
-- is the single source of truth for the submission.
--
-- The same wording is mirrored (for SMS + preview, which can't use the template)
-- in supabase/functions/_shared/broadcast.ts (renderMessage) and the modal
-- caption — keep all three in sync. Idempotent: re-running only rewrites this
-- one row.
-- ============================================================

update public.whatsapp_templates
set
  components = '[{"type":"BODY","text":"Hi {{1}}, an important update about your grooming appointment at Smarter Dog Grooming Salon: {{2}}. Please reply to this message and we''ll help with whatever you need.","example":{"body_text":[["Sam","we''re closed this Monday for emergency repairs, so we''ll be in touch to rebook you"]]}}]'::jsonb,
  updated_at = now()
where name = 'day_closure_v1'
  and language = 'en_GB'
  and version = 1;
