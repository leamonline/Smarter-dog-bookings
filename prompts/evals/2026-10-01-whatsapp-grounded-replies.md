---
id: whatsapp-grounded-replies-evaluation
status: testing
version: 1
purpose: Correct incomplete factual answers and unsupported portal guidance
related_requirements: [REQ-AI-001, REQ-CAP-002]
related_issues: [921]
last_reviewed: 2026-10-01
---

# Grounded replies follow-up

Base: `main@3b5185ab86772b0b18a588aab6778d3a142678e3`. Candidate prompt version: `2026-10-01.2`. The first comparison and its original scores remain unchanged; its summary is in documentation PR #929. Automatic review-draft enablement remains held.

The candidate requires verified facts before an account link, explains unavailable appointment lookups and unverified dates, explicitly distinguishes a requested time from a verified alternative, and forbids exposing internal automation controls. A confirmation question is required only when proposing a permitted booking action; factual and self-service replies do not imply that a confirmation button will follow.

Portal contract evidence: `src/components/customer/booking/DogSelection.tsx` supports selecting multiple dogs (up to four); `BookingWizard.tsx` uses the selected dogs and slot allocation for the grouped customer booking path. Selection is not a promise of simultaneous capacity. Replies must not invent separate or consecutive booking instructions.

Cancellation rubric follows the existing account-based next step: with several appointments, the customer selects the intended appointment in their account. No action or cancellation claim is permitted in self-service mode. This does not change the newly released cancellation policy.

# Verification and promotion

Fixture version 2 strengthens the changed-time and multi-dog criteria, reconciles cancellation selection with the account contract, and checks internal-setting disclosure in every case. First-run manifest, fixture version 1 and blind scores remain outside Git and are not rescored.

The synthetic handler test checks that the model receives the revised instructions and that the held draft still has no downstream side effects. These checks do not establish model compliance. A further, separately approved provider comparison must use exact source revisions, identical synthetic scenarios/settings and blind factual, usefulness and tone scoring. No provider call or flag change is authorised by this document.
