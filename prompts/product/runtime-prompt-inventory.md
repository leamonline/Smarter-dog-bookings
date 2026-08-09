# Runtime prompt inventory

Status: Active
Last verified: 9 August 2026
Related issue: #611

Runtime prompts remain next to their executable code. This inventory describes their purpose and guardrails without duplicating their text.

| Prompt ID | Status/version | Source | Purpose | Related contract | Output/enforcement | Evaluation evidence |
|---|---|---|---|---|---|---|
| `whatsapp-reply-assistant` | Production code; code-coupled and not independently versioned | `supabase/functions/whatsapp-agent/handler.ts` (`SYSTEM_PROMPT`) | Draft or stage WhatsApp replies and structured booking actions from conversation and server context | `REQ-AI-001`, `REQ-CAP-002`; #611 | Structured parsing, risk rules, feature gates and server-side booking commands; model prose is not booking authority | Colocated Deno dispatch/risk tests; expand through the runtime evaluation standard when changing prompt policy |
| `customer-note-extractor` | Production code; code-coupled and not independently versioned | `supabase/functions/whatsapp-update-notes/index.ts` (`userPrompt`) | Extract durable customer notes from bounded conversation text and existing notes | `REQ-SEC-001`, `REQ-MET-002`; #605/#611 | Server validates caller and applies the accepted note update | Add synthetic extraction, prompt-injection and no-new-fact fixtures before material changes |
| `dashboard-conversation-summary` | Production code; code-coupled and not independently versioned | `supabase/functions/dashboard-summary/index.ts` (`userPrompt`) | Produce a one-sentence staff-facing queue summary from server-selected items | `REQ-AI-001`, `REQ-MET-002`; #611/#612 | Display-only sentence; must not create or mutate bookings | Add fixed empty, single, plural and adversarial-content fixtures before material changes |

## Production requirements

- Treat conversation and customer content as untrusted data.
- Minimise personal data sent to a model and never include credentials.
- Keep authorisation, capacity, booking policy and write validation outside prompt prose.
- Version and evaluate material prompt changes on synthetic fixtures.
- Preserve deterministic fallback and feature gates for customer-affecting automation.
- Record model/configuration and rollout evidence in the issue or release record; never claim production enablement from source code alone.

The absence of an independent runtime prompt version is a current governance
gap, not permission to label the code `version: 1` retrospectively. A material
change should introduce an explicit version constant/metadata and evaluation
record in the same reviewed change.
