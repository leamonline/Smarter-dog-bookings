---
name: smarter-dog-booking-change
description: Plan, implement or review authorised Smarter Dog booking mutations, capacity rules, cancellation, rescheduling or visit-command changes.
---

# Booking changes

1. Read the issue, blockers and any active plan using the [task workflow](../../../docs/project-management.md#authorised-development-and-session-recovery). Identify the caller, the appointment or booking line it operates on, and the current database write.
2. Follow the [booking policy routing](../../../docs/specifications/booking-policy.md) and [capacity contract](../../../docs/capacity-engine.md) for the touched behaviour. Read the signed decision and relevant later ADR when policy is involved. Bring a material conflict between intent and implementation to the owner before changing policy. Preserve inactive command and policy boundaries per [ADR 002](../../../docs/architecture/decisions/002-separate-visit-authority-from-policy-activation.md).
3. Trace the normal caller through the hook, repository or RPC into the latest effective migration. Use Graphify for callers and test discovery when its revision is usable. Preserve customer ownership and authorised RPCs. Keep browser and Edge capacity preflights in parity with PostgreSQL. For an affected send, check the [send contract](../../../docs/send-outcomes.md) and distinguish the committed write from delivery evidence.
4. Use deterministic fixtures. Cover the changed observable outcome and refusal path. Assert the persisted row for writes. For a database change include pgTAP. For concurrent-write or capacity races use the two-session harness in addition to parity checks across affected runtimes. If replacing a screen, account for every state the old screen displayed. See the [repository validation rules](../../../AGENTS.md#code-and-validation-conventions).
5. Record caller, governing rule, write authority, evidence, and any deploy dependency or unresolved decision in the issue or PR. Follow the [implementation prompt](../../../prompts/agents/implementation-agent.md) when handing off bounded implementation work.
