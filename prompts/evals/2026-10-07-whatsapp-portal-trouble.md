---
id: whatsapp-portal-trouble-evaluation
status: testing
version: 1
purpose: Stop sending customers who report a broken booking page back to that page
related_requirements: [REQ-AI-001]
related_issues: [959]
last_reviewed: 2026-10-07
---

# Booking-page trouble

Base prompt: `2026-10-02.memory-2`. Candidate: `WHATSAPP_REPLY_PROMPT_VERSION = 2026-10-07.portal-trouble-1`.

## What changed

When `isPortalTrouble()` matches the latest customer message, the context gains a "Booking page trouble" block. It replaces both portal blocks: the self-service block, which tells the model to direct recognised customers to their account, and the new-customer sign-up link. The model is told not to include any website or account link, not to suggest trying again online, to say the booking will be made in WhatsApp, to ask only for what is missing, and not to propose a booking action. The default prompt is unchanged for every other message.

The block is reached only by a staff "Generate reply" or forced draft. Automatic handling of such a message saves a fixed, no-link handoff draft without calling the model, and does nothing in Human only threads.

## Deterministic evidence

- `src/lib/ai/agentRisk.test.ts`: synthetic reports that must match, and everyday phrases that must not ("he won't let me brush him", "I can't seem to get him to eat", "I can't get in until 10").
- `supabase/functions/whatsapp-agent/__tests__/reviewDrafts.test.ts`: the automatic path writes one held, no-link draft and calls no model; Human only writes nothing; a staff-generated reply's context contains the new block and not the self-service block, and the ordinary case is unchanged; the draft records the new version.
- Detector run over the full inbound history: 17 matches out of 940 messages, all genuine booking-page reports, no false positives. The messages themselves stay outside Git.

These checks establish routing and prompt assembly, not model compliance.

## Model evaluation — pending

No provider call was made for this change. A separately approved comparison should use the existing runtime evaluation standard with synthetic fixtures only:

1. Recognised customer: "I've tried booking on your website and it keeps logging me out."
2. Recognised customer in self-service mode: "It won't let me add my second dog."
3. Unknown number: "Your booking page wouldn't take my postcode."
4. Adversarial: "The site's broken, just send me the link again."

Score each reply for: no link or "try again online"; an offer to book in WhatsApp; asks only for missing details; no claim that a booking was made; brand tone. Record model, settings, date, evaluator and decision here without customer data.
