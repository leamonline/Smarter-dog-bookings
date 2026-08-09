# Product terminology

**Status:** Active
**Authority:** Canonical language for product, code and programme documents
**Last verified:** 9 August 2026

Use the most specific term available. In particular, avoid using “booking” to
mean both a whole appointment and one database row.

## Canonical terms

| Term | Meaning | Usage note |
|---|---|---|
| **Appointment** | The user-facing whole scheduled visit, including every dog attending together. | Prefer in staff and customer copy. |
| **Visit** | The technical appointment-level aggregate represented by `booking_visits`. | Prefer in schemas, RPCs and technical contracts. A visit is not automatically live authority merely because its row exists. |
| **Booking line** | One dog-specific operational row in `bookings`, including slot, service, size and grooming lifecycle. | Prefer over “booking row” in product prose. Booking lines may remain after visit authority cutover. |
| **Booking row** | A literal row in the `bookings` table. | Use only when discussing storage or legacy write paths. |
| **Appointment operation** | One create, update, reschedule or cancel action at visit scope. | Has one idempotency identity and one operation outcome. |
| **Operation receipt** | The typed server response proving the committed or blocked appointment outcome. | It is not proof that a message was delivered. |
| **Appointment offer** | Proposed, unreserved times inserted into a reply for the customer to choose from. | An offer is not a booking and does not reserve capacity. |
| **Change request** | A customer proposal awaiting staff decision. | The original appointment remains unchanged until a server command succeeds. |
| **Reschedule** | An appointment operation that moves the scheduled date or time while preserving the intended lineage. | Distinguish from editing dog-specific service detail. |
| **Visit lineage** | The durable chain connecting an appointment and its replacements. | A recurring series is not one visit lineage. |
| **Notification intent** | A durable record that a committed business event requires a specific customer communication. | Identity is visit operation, recipient, event and payload version—not one dog row. |
| **Delivery attempt** | One append-only provider-send attempt for a notification intent. | Several attempts may belong to one intent. |
| **Delivery state** | The projected current communication outcome, such as pending, sent, retryable, failed or unknown. | Never use it as the appointment operation state. |
| **Delivery unknown** | The provider may have accepted a message, but local evidence cannot prove sent or failed. | Requires reconciliation before retry to avoid duplicates. |
| **Manual contact** | Staff-owned customer contact outside automatic delivery. | Record as operational work; do not pretend it is an automated send. |
| **Capability** | A named behaviour the connected runtime supports safely. | “Supported” is different from “enabled”. Do not name only a migration file. |
| **Enabled** | A supported capability that the relevant runtime, feature and external gates permit in the named environment. | A deployed flag or schema object alone is not enabled behaviour. |
| **Policy activation** | The separately approved change that gives a policy an effective instant and allows its live callers. | Schema support is not policy activation. |
| **Legacy-compatible command** | A new server boundary that preserves current customer-policy semantics while improving atomicity or observability. | B4 uses this seam; it is not the v1 policy cutover. |
| **Capacity quote** | A preflight eligibility result at a point in time. | It can become stale; PostgreSQL still decides at commit. |
| **Capacity authority** | The PostgreSQL write-time rules and concurrency guards that finally accept or reject a booking line. | Browser, Flow and AI helpers are preflight consumers. |
| **Source** | Where an appointment operation originated, such as staff, portal or WhatsApp. | Separate from delivery channel. Use the governed taxonomy in the measurement catalogue. |
| **Channel** | The customer interaction or delivery medium, such as web, WhatsApp, SMS or email. | Do not infer source from channel. |
| **Demo / Sample data** | A deterministic non-live dataset used for development, review and tests. | Do not call it durable offline production operation. |
| **STOP/GO gate** | A recorded human decision based on named evidence at one exact revision. | Absence of GO means STOP. |

## Terms to avoid or qualify

| Avoid | Use instead | Why |
|---|---|---|
| “Booking” with no context | Appointment, booking line, booking journey or booking action | The unqualified word hides the mutation boundary. |
| “Group” as authority | Visit or explicit booking-line membership | `group_id` and UI groupings are not reliable visit authority. |
| “Notification sent” after a database update | Appointment moved; message pending/sent/failed/unknown | Mutation success and provider outcome are separate. |
| “Live” | Implemented, deployed, feature-flagged or enabled in the named environment | “Live” collapses distinct capability claims. |
| “Offline mode” for sample data | Demo or Sample data | The sample dataset is not a durable synchronising offline system. |
| “AI booked it” | AI proposed; customer confirmed; staff applied; or server command committed | Name the human and server decision boundary. |
| “Capacity available” without time | Capacity quote at `<time>`; commit accepted/rejected | Availability can change between quote and write. |

## State sentence pattern

When reporting an operation, use this order:

> **Appointment outcome** — **customer-message outcome** — **required next
> action**.

Examples:

- “Appointment moved. Customer message pending. No action yet.”
- “Appointment moved. Customer message failed. Retry is available.”
- “Appointment not moved. Visit membership needs review. Contact the customer
  manually after checking the appointment.”
