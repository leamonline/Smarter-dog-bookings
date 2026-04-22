-- ============================================================
-- 030_whatsapp_draft_reject_reason.sql
-- Add a reason field to whatsapp_drafts so we can record WHY a
-- staff member rejected an AI draft. Gold dust for prompt tuning.
--
-- Why now: v1 inbox shipped with Reject as a single-click action
-- that just flipped state to 'rejected'. That's fine for "send/don't
-- send" bookkeeping but terrible for learning — we can't diff the
-- draft against the eventual human reply without knowing what was
-- wrong with it. One free-text field is all we need for now; we can
-- always structure it later (dropdown of common reasons) once we see
-- what patterns emerge.
--
-- Shape:
--   - Nullable TEXT — reject without a reason is still allowed
--   - No length cap in DB; UI caps at 500 chars to keep it scannable
--   - Stored only on rejection; no meaning for approved/pending/sent
-- ============================================================

alter table whatsapp_drafts
  add column if not exists rejected_reason text;

comment on column whatsapp_drafts.rejected_reason is
  'Free-text reason a staff member gave when rejecting this AI draft. Null for non-rejected drafts. Used for prompt tuning — diff against the eventual human reply to understand where the agent went wrong.';

-- No backfill: old rejections had no reason captured, null is correct.
-- No index: we query by state/conversation_id, never by reason.

-- ============================================================
-- Rollback:
--   alter table whatsapp_drafts drop column rejected_reason;
-- ============================================================
