# WhatsApp synthetic prompt comparison

Related issue: #921. Governing [plan](../../docs/plans/active/2026-10-01-whatsapp-agent-review-drafts.md) and [evaluation record](../../prompts/evals/2026-10-01-whatsapp-review-drafts.md). No customer data, production reads or booking writes are needed.

## Prepare without credentials

```bash
node scripts/whatsapp-eval/compare.mjs prepare /tmp/whatsapp-comparison
node --test scripts/whatsapp-eval/compare.test.mjs
```

For a follow-up, append an explicit baseline and candidate Git revision to `prepare`. Both are resolved to full commit SHAs before capture; uncommitted edits are excluded. The default preparation archives the exact baseline `c699e904` and merged candidate `48895646` to temporary directories, then invokes their real handlers against synthetic fetch responses. It captures the actual provider request, with no real network calls from either handler. The child environment replaces all runtime secrets with synthetic placeholders; `.env` files are never loaded. Temporary source archives are removed; generated requests remain outside the repository. Remote Deno module resolution uses the normal dependency cache; it is not a model request.

Fourteen fixtures cover verified Thursday opening, closure, missing dates, later and cancelled appointments, failed lookups, supplied facts, ambiguous cancellation, two dogs, a puppy, changed times, further-ahead requests, injection and BST midnight. No production transcript is copied. The manifest records source revisions, fixture hash, model and request hashes. Dates are fixed at `2026-10-01T23:30:00Z` (2 October in London).

This compares the whole drafting treatment. The baseline uses staff-forced drafting. The candidate uses the isolated automatic review route for new-booking fixtures and staff-forced drafting for other intents. Those other cases cannot be assumed to qualify for automatic review drafts. Model/settings stay identical: `claude-sonnet-4-6`, 512 maximum output tokens, existing sampling defaults. One run is preliminary evidence because model output is not deterministic.

## Execute only after provider-use approval

The repository's `AGENTS.md` requires separate approval for credential use. Obtain approval for this concrete 28-request run and have the approved Anthropic key supplied through the process environment. Never paste a key into chat, commit it, print it or load `.env.local`.

```bash
node scripts/whatsapp-eval/compare.mjs execute /tmp/whatsapp-comparison
```

Maximum output is 14,336 tokens across 28 serial requests. Input tokens and cost depend on provider accounting; no spending figure is asserted. Each request times out after 60 seconds. The runner stops on HTTP/network failure without retry, retains completed evidence and refuses a directory containing previous execution evidence. A failed run needs investigation and separately authorised retry; do not merely prepare a new directory to bypass this boundary.

## Review and decision

First read `blind-review.json`, scoring each reply against its fixture criteria without opening `blind-key.json` or `results.json`. Mark every criterion pass/fail/uncertain; uncertain critical criteria require resolution. Check UK English, warmth and concise wording alongside factual grounding, repeated supplied-field questions and booking claims. Do not reveal the key until scoring is saved separately outside the repository. Then use the key to compare versions and record all critical failures and regressions in #921.

Automated schema checks and review-mode action detection in `results.json` are preliminary, not a substitute for reading each reply. They do not reimplement the production parser or prove server action enforcement. Existing Edge tests cover timeouts, malformed model output, routing and actual stored rows separately. Provider evaluation never contacts customers, sends WhatsApp messages or exercises a live database.

Keep raw replies, blinded scores and manifest outside Git; commit only the synthetic fixtures, runner and a minimised result summary. Passing this comparison does not authorise staging or production flag changes. Staging isolation evidence, current production settings and owner-approved promotion/rollback remain separate gates.
