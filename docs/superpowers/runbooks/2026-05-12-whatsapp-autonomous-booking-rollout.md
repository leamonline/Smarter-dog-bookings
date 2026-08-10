# WhatsApp autonomous booking — rollout playbook

**Status:** ready to roll out behind flags
**Owner:** Bleep
**Linked spec:** [2026-05-12-whatsapp-ai-autonomous-booking-design.md](../../archive/superpowers/specs/2026-05-12-whatsapp-ai-autonomous-booking-design.md)
**Linked plan:** [2026-05-12-whatsapp-ai-autonomous-booking.md](../../archive/superpowers/plans/2026-05-12-whatsapp-ai-autonomous-booking.md)

## Pre-deploy checklist

- [ ] Migration `20260512140000_whatsapp_autonomous_booking.sql` applied to staging
- [ ] Migration `20260512160000_whatsapp_ai_humans_phone_unique.sql` applied to staging (partial unique index that prevents duplicate AI-onboarded humans rows)
- [ ] `APPLY_CONFIRM_INTERNAL_SECRET` env var generated (32-char random) and added to:
  - `whatsapp-agent` (caller)
  - `apply-customer-confirm` (receiver)
- [ ] `apply-customer-confirm` edge function deployed: `supabase functions deploy apply-customer-confirm --project-ref "<project-ref>" --no-verify-jwt`
- [ ] `whatsapp-agent` and `whatsapp-send` redeployed with the new code on this branch
- [ ] `AI_AUTONOMOUS_BOOKING_ENABLED=false` confirmed in env on `whatsapp-agent` (the global kill switch is off by default; we flip it after staff dial-up)
- [ ] Full test suite green: `npm run test` (expect 347 tests passing)
- [ ] Typecheck green: `npm run typecheck`

## Phase A — single trusted customer

1. Pick one trusted customer (e.g. yourself or a regular who's comfortable being a guinea pig).
2. Log into the inbox at `/whatsapp`, open their conversation.
3. Toggle "Auto-book on" (the sky-coloured pill next to the existing emerald Auto-send toggle in the conversation header).
4. Globally enable autonomous booking: set env var `AI_AUTONOMOUS_BOOKING_ENABLED=true` on `whatsapp-agent`.
5. From the customer's phone, send a real booking message: *"Can you fit Alfie in for Monday at 9:30?"*
6. Observe end-to-end:
   - AI proposes the slot in a text reply that ENDS with a question ("Shall I book that in for you?")
   - Customer receives a Meta interactive button message: *"Confirm Mon 19 May at 09:30 — full groom?"* with `[Yes, book it]` / `[No, change]`
   - Customer taps Yes
   - Booking row appears in the diary with `source='whatsapp_ai_auto'`
   - Acknowledgement text arrives: *"You're booked in ✓ Mon 19 May at 09:30 for Alfie's full groom"*
7. Verify in `whatsapp_booking_actions` the state transitions:
   `pending → awaiting_customer_confirm → confirmed → auto_applied`
8. Run for one week; watch for any anomalies.

## Phase B — small cohort (5-10 customers)

Once Phase A is stable for a week:
1. Pick 5-10 more regulars across different breeds (small and medium only — large dogs stay on the staff-approval path).
2. Flip `autonomous_booking_enabled` for each via the inbox toggle.
3. Watch for two weeks. Expected behaviour:
   - Small/medium known customers with recognised breeds: autonomous create path runs end-to-end.
   - Large dogs: stay on `pending` → `BookingActionPanel` for staff approval (no buttons sent to customer).
   - Unknown breeds: stay on `pending` for staff to confirm size.
   - Reschedules and cancellations on small/medium: also autonomous, with apply-time gates (≥4h for reschedule, status='Booked' for cancel).
   - New customers (unknown phone): collected over multiple turns, first booking still routes to staff approval via the staging `lead_payload` until staff finalise the customer setup.

## Phase C — broad rollout

Once Phase B is stable:
1. Decide whether to flip `autonomous_booking_enabled` by default for new conversations. A separate migration to change the column default would do this.
2. Document the criteria for staff to opt out individual customers if they prefer staff approval (e.g. complex bookings, frequent reschedules, recent complaints).

## Kill switch

If anything goes wrong:

1. **Immediate global stop**: set `AI_AUTONOMOUS_BOOKING_ENABLED=false` on `whatsapp-agent` and redeploy. New customer messages will fall back to the existing staff-approval path. Already-sent confirm buttons remain valid; the apply path keeps working but no new auto-routed proposals will be sent.
2. **Pause one conversation only**: toggle "Auto-book off" in the inbox header.
3. **Rescue a stuck `awaiting_customer_confirm` row**:
   ```sql
   UPDATE whatsapp_booking_actions
     SET state='pending',
         customer_confirm_message_id=NULL,
         customer_confirm_expires_at=NULL
     WHERE state='awaiting_customer_confirm'
       AND id=$1;
   ```
   The action then surfaces in the staff inbox for manual handling.

## Monitoring queries

- **New AI-onboarded customers** (spot-check `humans` and `dogs` rows):
  ```sql
  SELECT id, name, surname, phone, notes, created_at
  FROM humans
  WHERE source = 'whatsapp_ai'
  ORDER BY created_at DESC
  LIMIT 20;
  ```

- **Auto-applied bookings by day**:
  ```sql
  SELECT date_trunc('day', applied_at)::date AS day, count(*)
  FROM whatsapp_booking_actions
  WHERE state = 'auto_applied'
  GROUP BY day
  ORDER BY day DESC;
  ```

- **Failures that fell back to staff**:
  ```sql
  SELECT id, conversation_id, action, error_message, created_at
  FROM whatsapp_booking_actions
  WHERE state = 'pending'
    AND error_message LIKE 'auto_apply_failed:%'
  ORDER BY created_at DESC;
  ```

- **Customer rejections by reason**:
  ```sql
  SELECT count(*), rejection_reason
  FROM whatsapp_booking_actions
  WHERE state = 'rejected_by_customer'
  GROUP BY rejection_reason
  ORDER BY count(*) DESC;
  ```

- **Stale `awaiting_customer_confirm` rows** (past TTL but not yet cleaned up — should self-heal on next button-reply check, but worth surfacing):
  ```sql
  SELECT id, conversation_id, action, customer_confirm_expires_at
  FROM whatsapp_booking_actions
  WHERE state = 'awaiting_customer_confirm'
    AND customer_confirm_expires_at < now() - interval '1 hour'
  ORDER BY customer_confirm_expires_at;
  ```

## Known limitations

- **Large dogs**: stay on staff approval path. The day-level availability block (`get_large_dog_day_availability`) is informational only — the AI doesn't propose specific times for large dogs.
- **Unknown breeds**: the inline breed list in `whatsapp-agent/index.ts` (`inferDogSize`) is a curated subset of common UK breeds. A breed not in the list returns `"unknown"` and `canAutoBook` fails — the proposal falls back to staff approval. Keeping the inline list in sync with `src/constants/breeds.ts` is a manual periodic task.
- **Reschedules within 4h**: blocked at apply-time (`too_close_at_apply_time_4h`) — staff handle these.
- **Cancellations**: no apply-time recency gate today (deliberate trade-off — last-minute cancellations are normal business). Worth revisiting if same-day cancellations cause operational pain.
- **`groom_notes` overwrite on correction**: if staff manually append notes to an AI-onboarded dog and the customer later corrects coat condition, the notes can be lost. Acceptable today (AI owns these records); a richer schema (separate `coat_condition` column) would fix this properly.
- **Conversation-update failure mid-onboarding**: if `createNewCustomerRecords` succeeds at humans + dogs but the conversation-link UPDATE fails, the customer's next turn will see a "still unknown" conversation and reuse the existing humans row (idempotent SELECT), but the dogs INSERT would conflict. Surfaces as a `conversation link failed` error in the agent logs — needs manual link fix.

## Where the code lives

- Migration: `supabase/migrations/20260512140000_whatsapp_autonomous_booking.sql`
- Partial unique index: `supabase/migrations/20260512160000_whatsapp_ai_humans_phone_unique.sql`
- Agent + autonomy gate: `supabase/functions/whatsapp-agent/index.ts`
- Confirm-buttons sender: `supabase/functions/whatsapp-send/index.ts` (`confirm_buttons` mode) and `supabase/functions/_shared/confirmButtons.ts`
- Confirm receiver: `supabase/functions/apply-customer-confirm/index.ts`
- Autonomy gate helper: `supabase/functions/_shared/agentRisk.ts` (`canAutoBook`)
- Inbox UI: `src/components/views/WhatsAppInboxView.jsx` (badge, toggle)
- Hook: `src/supabase/hooks/useWhatsAppInbox.js` (`setAutonomousBookingEnabled`)
- Static security review: `src/security/supabaseSecurityReview.test.ts` (4 new regression assertions)
