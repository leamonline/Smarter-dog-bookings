# ADR 014: Customer-added trusted humans are live on save

Status: Accepted (owner decision, 15 November 2026); implemented on a branch, not yet applied to production
Date: 2026-11-15
Migration: `20261115120100_customer_trusted_contacts.sql`
Supersedes, for this surface: the "verified trusted-contact invitations" lifecycle in the [July legal-risk remediation design](../../archive/superpowers/specs/2026-07-12-legal-risk-remediation-design.md#2-verified-trusted-contact-invitations)

## Context

Trusted humans are the people a customer allows to drop off or collect their dog. In July 2026 the legal-risk review (finding H-02) removed the portal's way to add one. The old `add_customer_trusted_human` matched the typed phone number against existing customer records. It returned the matched person's name, which revealed who owns a number. It also linked that person, or created a customer record for them, without their knowledge. The remediation design replaced it, on paper, with an invitation lifecycle: a single-use secret, sent to the trusted person and accepted from their own verified phone, with nothing live until then. That lifecycle was never built. The portal showed "temporarily unavailable" for four months.

On 15 November 2026 the owner chose, from three options (staff check first, live straight away, text invitation), that a customer-added trusted human is **live as soon as it is saved**.

## Decision

Customers add, edit and remove their own trusted humans in the portal, and each is trusted on save. What H-02 actually closed stays closed:

- **No identity lookup.** Contacts live in their own table, `customer_trusted_contacts`. They are never matched against `humans`, and the database returns only what the customer typed, so the form reveals nothing about who owns a number.
- **No customer records for third parties.** Nothing creates a `humans` row, so a contact cannot sign in as, be messaged as, or be merged into a customer. Phone sign-in can never land on a record someone else created.
- **The staff link table is untouched.** Customers still cannot write to `human_trusted_contacts`, and `add_customer_trusted_human` stays dropped (pgTAP `120` unchanged).
- **Narrow customer surface.** Customers have no table privilege. They use three `SECURITY DEFINER` commands that derive the owner from `auth.uid()`, validate the name and phone (the same rule as the staff form), and cap the list at six people.
- **Staff can see and remove them.** Every surface showing trusted humans lists customer-added people, marked "Added by customer".
- **Merges keep them.** `merge_humans` moves a merged-away record's contacts to the winner.

The acceptance step is dropped. The customer is asked, in the form, to tell the person they have shared their details with the salon.

## Consequences

- A customer can add someone who does not know they have been added. The salon holds that person's name and phone number on the customer's say-so. The privacy notice should say that the salon keeps contacts customers provide for drop-off and collection, and how to ask for removal. That wording is an owner/legal task outside this repository.
- These contacts receive no messages. Nothing reads them for notifications, and portal bookings still do not set `notify_human_ids`. Changing either is a separate decision.
- Staff keep their existing route for linking an existing customer as a trusted human. The two lists sit side by side and are not merged.
- Rollback: the migration is expand-only. Hiding the portal form (UI) or revoking the three functions removes the capability without touching stored rows.
