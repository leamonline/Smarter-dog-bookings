# Closure integrity rollback

## Classification

The closure-integrity rollout is **operationally reversible but not an exact
schema down-migration once linked closure tasks exist**.

The migration adds nullable task links, constraints, indexes, triggers and two
staff commands. Dropping the link columns after staff have created or repaired
typed tasks would destroy the only durable connection between the task and the
visit. An exact return to the old schema is therefore one-way after first use.

The legacy-task repair is also a one-way data reconciliation. Recreating
generic, independently tickable tasks—or restoring known false completion
states—would deliberately reintroduce the incident.

## Operational rollback

If the merged application has to be rolled back:

1. Disable the date-closure control in the application deployment. Do not
   restore the old split `day_settings` plus free-text task flow.
2. Deploy a forward rollback migration that:
   - revokes both public closure commands;
   - drops `trg_guard_closure_rearrangement_task`,
     `trg_guard_day_closure_has_tasks` and
     `zz_guard_active_booking_on_closed_day`;
   - drops their private trigger functions and the two public commands;
   - leaves `booking_visit_id`, `closure_date`, their constraints and indexes
     in place so existing links are not destroyed.
3. Roll the frontend back only after that compatibility migration is applied.
4. Treat existing typed tasks as read-only operational records until the
   closure flow is restored by a new forward migration.

This rollback restores the old application's database compatibility, but it
also removes the protection against split closure/task outcomes. Staff must not
close dates through the old control while rollback mode is active.

## Forward recovery

Restore the closure UI and database guards together in a new forward migration.
Do not edit or replay the already-applied migration record. Verify the atomic
close, guarded task completion and reopen journey before enabling the control.
