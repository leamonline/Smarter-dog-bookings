# Interface capability truth

**Status:** Active

**Authority:** Current user-facing capability reference for issue #617

**Last verified:** 11 August 2026 against the A2 branch code

This page separates repository support from a capability that a staff member
can actually use. It is intentionally a code-verified snapshot: flags, routes
and production callers below are linked so a later activation is visible in
review. It does not assert a hosted environment's configuration.

## Current capability matrix

| Capability | Supported in the repository | Enabled now | Flag, caller and route evidence |
|---|---|---|---|
| Staff diary booking | Yes | Yes for authorised staff | The normal dashboard route is [`/`](../src/App.jsx); [`useBookings`](../src/supabase/hooks/useBookings.js) calls the legacy `createStaffBookingGroup` path. This remains the live staff booking authority. |
| Inbox appointment offers | Yes | Yes | [`/inbox`](../src/components/views/inbox/workspace/InboxWorkspaceController.jsx) renders [`BookingActionsPane`](../src/components/views/booking-workspace/BookingActionsPane.jsx). Its enabled action composes appointment options into a staff reply; it does not create a booking. |
| Direct booking from Inbox | The legacy conversation RPC and helper remain as repository support | **No** | The Inbox exposes an unavailable state before interaction and has no `BookAppointmentModal` or `createStaffBooking` caller. Staff are directed to the diary instead. A pending AI booking proposal is a separate, existing staff-approval flow and must not be described as direct Inbox booking. |
| Booking Desk | Yes, as a read-only appointment-offer workspace | Conditional | [`FEATURE_FLAGS.booking_workspace_enabled`](../src/constants/features.ts) is true in development or when `VITE_BOOKING_WORKSPACE_ENABLED=1`; [`App`](../src/App.jsx) also limits it to an owner, or development with sample data. The route is [`/booking-workspace`](../src/components/layout/navConfig.jsx). The Desk offers times; it does not activate direct Inbox booking. |
| AI drafting and auto-send | Yes | Drafting is staff-invoked; automatic sending and autonomous booking remain fail-closed | The current flags and per-conversation gates are documented in [`whatsapp-agent.md`](whatsapp-agent.md). This A2 work does not change them. |
| Visit-policy commands and `previous_day_1500_v1` | Yes, as deployed support and typed wrappers | **No** | [`useBookingPolicyRuntime`](../src/supabase/hooks/useBookingPolicyRuntime.ts) treats the inactive runtime as the default. [`bookingPolicyInactiveIsolation.test.ts`](../src/security/bookingPolicyInactiveIsolation.test.ts) prevents every listed v1 mutation command from gaining a production caller. The policy is not activated by interface copy or error handling. |
| Demo / Sample data | Yes | Only when forced for tests or when development has no Supabase credentials | [`src/data/sample.js`](../src/data/sample.js) is the deterministic source. [`VITE_FORCE_OFFLINE`](../src/supabase/client.ts) selects it for E2E; a production deployment with missing credentials renders a misconfiguration page instead. Sample data is not durable offline operation and changes are not saved. |

## Safe failures and diagnostics

[`ErrorBoundary`](../src/components/ui/ErrorBoundary.jsx) shows recovery copy,
an optional support reference and retry/reload actions. It never displays the
exception message. It reports through [`logger.error`](../src/lib/logger.ts)
once; the logger owns the Sentry submission, so the same exception is not
captured a second time.

Before Sentry accepts an event, [`sentryBeforeSend`](../src/lib/sentry.js)
redacts in two passes.

**By pattern**, anywhere in diagnostic strings or nested event data: UK phone
numbers, email addresses, UK postcodes, bearer tokens and UUIDs.

**By key**, in structured data: names, addresses, notes, social handles and
message content. A name cannot be pattern-matched — `Fido` is indistinguishable
from any other word — so these are caught by the key they sit under instead.
The key list tracks the schema's real customer columns: `humans` (`name`,
`surname`, `address`, `notes`, `history_flag`, `fb`/`insta`/`tiktok`), `dogs`
(`name`, `groom_notes`, `alerts`) and `whatsapp_messages` (`content`). Bare
`name` is included deliberately, because in a Supabase request body it is a
person's or a dog's name.

A container under a sensitive key keeps its shape and is walked rather than
dropped, so `body: { name, slot }` loses the name and keeps the slot. Arrays
keep their length. Sentry tags are never redacted, so the `component` and `op`
tags that call sites set still identify where a failure happened.

`logger.error`'s own message is exempt from the key pass — it is the primary
diagnostic and developer-authored — but still goes through the pattern pass.

Together this preserves a useful error class and support reference without
retaining customer identifiers in the report.

## Verification guards

- [`BookingActionsPane.component.test.jsx`](../src/components/views/booking-workspace/BookingActionsPane.component.test.jsx) proves that direct Inbox booking is disabled and labelled before interaction.
- [`CustomerContextPanel.component.test.jsx`](../src/components/views/inbox/customer-context/CustomerContextPanel.component.test.jsx) proves the customer context has no direct-booking control.
- [`ErrorBoundary.component.test.jsx`](../src/components/ui/ErrorBoundary.component.test.jsx) proves raw exception text is absent from recovery UI and the error is reported once.
- [`bookingPolicyInactiveIsolation.test.ts`](../src/security/bookingPolicyInactiveIsolation.test.ts) proves dormant visit-policy commands have no production caller and the live staff diary continues to use the legacy group path.
