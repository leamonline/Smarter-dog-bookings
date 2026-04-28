// ============================================================
// supabase/functions/_shared/agentRisk.ts
//
// Deterministic helpers for the WhatsApp AI receptionist.
//
// This file is the single source of truth for:
//   - the intent <-> risk mapping
//   - the keyword-based escalation rules (medical, complaint, walk-in)
//   - the auto-send gate
//   - the conversation-state shape and merge semantics
//   - brand-voiced fallback templates used when Claude is unreachable
//
// Imported by:
//   - supabase/functions/whatsapp-agent/index.ts  (Deno runtime)
//   - src/lib/ai/agentRisk.test.ts                (Vitest / Node)
//
// Constraints:
//   - Pure TypeScript, no runtime imports — works in both Deno and Node.
//   - No side effects at module load.
//   - All exports are tree-shakable.
//
// Why a shared module: the brief asks for "Claude handles language,
// the app handles truth". This file is the truth surface — every
// decision that can be made deterministically (risk, handoff,
// auto-send eligibility) lives here so it stays consistent across
// the agent, the dashboard, and any future callers.
// ============================================================

// ── Risk levels and intent vocabulary ────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high"] as const;

// The 11 internal intents the system prompt and DB CHECK constraint
// already use. Do not extend this without also altering the
// whatsapp_drafts.intent CHECK constraint in a new migration.
export type Intent =
  | "faq"
  | "greeting"
  | "booking_query"
  | "booking_propose"
  | "booking_confirm"
  | "booking_change"
  | "booking_cancel"
  | "confirm_time"
  | "smalltalk"
  | "escalate"
  | "other";

export const INTENTS: readonly Intent[] = [
  "faq",
  "greeting",
  "booking_query",
  "booking_propose",
  "booking_confirm",
  "booking_change",
  "booking_cancel",
  "confirm_time",
  "smalltalk",
  "escalate",
  "other",
] as const;

// Base risk per intent before keyword/confidence overrides.
//
// Reasoning per row:
//   greeting/smalltalk/faq/confirm_time → low. Routine, mostly
//     informational, hard to do real damage.
//   booking_query → low. The agent only reads availability blocks
//     it was given; it cannot promise a slot.
//   booking_propose/booking_change/booking_cancel → medium. Could
//     mislead a customer about a booking; staff approves before send.
//   booking_confirm → medium. We never want the AI confirming a
//     booking end-to-end; staff signs off.
//   escalate → high. Always.
//   other → medium. Safer default than low for an unknown bucket.
export const INTENT_BASE_RISK: Readonly<Record<Intent, RiskLevel>> = {
  faq: "low",
  greeting: "low",
  smalltalk: "low",
  confirm_time: "low",
  booking_query: "low",
  booking_propose: "medium",
  booking_change: "medium",
  booking_cancel: "medium",
  booking_confirm: "medium",
  escalate: "high",
  other: "medium",
};

// External-facing intent vocabulary from the brief / user docs. Maps
// the user's UPPERCASE shape onto the internal lowercase set. Lets
// docs, future channels, and tests use either vocabulary without
// churning the DB CHECK constraint.
export const INTENT_ALIAS: Readonly<Record<string, Intent>> = {
  NEW_ENQUIRY: "greeting",
  BOOKING_REQUEST: "booking_propose",
  BOOKING_CONFIRMATION: "booking_confirm",
  CONFIRMATION: "booking_confirm",
  RESCHEDULE_REQUEST: "booking_change",
  RESCHEDULE: "booking_change",
  CANCELLATION_REQUEST: "booking_cancel",
  CANCEL: "booking_cancel",
  PRICE_CHECK: "faq",
  WALK_IN_SERVICE: "faq",
  COLLECTION_READY_OR_ON_WAY: "smalltalk",
  COLLECTION: "smalltalk",
  THANKS_OR_ACKNOWLEDGEMENT: "smalltalk",
  COMPLAINT_OR_SENSITIVE: "escalate",
  HEALTH_OR_MEDICAL: "escalate",
  UNKNOWN: "other",
};

// ── Keyword sets ─────────────────────────────────────────────
// Lower-case substrings. Match is case-insensitive substring (not
// word-boundary) to catch typos and word fragments. Ordered by how
// likely they are to appear so early hits short-circuit faster.

export const MEDICAL_KEYWORDS: readonly string[] = [
  "vet",
  "blood",
  "wound",
  "injur",   // injury, injured, injuries
  "limp",
  "sick",
  "ill ",
  " ill",
  "skin infection",
  "rash",
  "lump",
  "tumour",
  "tumor",
  "seizure",
  "fit ",
  "fits ",
  "pregnan",
  "anxious",
  "anxiety",
  "sedat",
  "medication",
  "medicine",
  "surgery",
  "operation",
  "scab",
  "bleeding",
  "swollen",
  "ear infection",
  "abscess",
  "allergy",
  "allergic",
  "in pain",
  "in season",
];

export const COMPLAINT_KEYWORDS: readonly string[] = [
  "complain",
  "complaint",
  "unhappy",
  "disappointed",
  "refund",
  "compensation",
  "trading standards",
  "solicitor",
  "lawyer",
  "review",         // "leaving a bad review", risky to auto-respond to
  "1 star",
  "one star",
  "appalled",
  "shocked",
  "disgusted",
  "demand",
  "ridiculous",
  "unacceptable",
  "fleas dispute",
];

export const WALKIN_KEYWORDS: readonly string[] = [
  "nail",
  "claw",
  "gland",
  "anal",
  "ear clean",
  "clean ears",
  "ear pluck",
  "walk in",
  "walk-in",
  "pop in",
];

// Intents that may be auto-sent (subject to all the gates in
// canAutoSend). booking_* intents are intentionally absent because
// they touch the diary and we always want staff to sign off.
export const AUTO_SENDABLE_INTENTS: readonly Intent[] = [
  "faq",
  "greeting",
  "smalltalk",
  "confirm_time",
];

// ── Helpers ──────────────────────────────────────────────────

function containsAny(haystack: string, needles: readonly string[]): boolean {
  const text = (haystack ?? "").toLowerCase();
  for (const needle of needles) {
    if (text.includes(needle)) return true;
  }
  return false;
}

/**
 * Detect walk-in service mentions (nails, glands, ear cleans).
 * Walk-ins do not need a booking — the agent should answer with the
 * canned walk-in info, not propose a slot.
 */
export function isWalkInService(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  return containsAny(messageText, WALKIN_KEYWORDS);
}

/**
 * Risk classifier: combines intent base risk with keyword overrides
 * and a confidence floor.
 *
 * Order of decisions matters:
 *   1. Medical or complaint keywords → high, always. Even on a
 *      benign intent like "greeting", a message with "blood" in it is
 *      not low risk.
 *   2. escalate intent → high.
 *   3. Confidence below 0.6 → at least medium. Claude is uncertain;
 *      so are we.
 *   4. Otherwise, the base intent risk applies.
 */
export function classifyRisk(
  intent: Intent,
  messageText: string | null | undefined,
  confidence: number,
): RiskLevel {
  const text = messageText ?? "";

  if (containsAny(text, MEDICAL_KEYWORDS)) return "high";
  if (containsAny(text, COMPLAINT_KEYWORDS)) return "high";
  if (intent === "escalate") return "high";

  const base = INTENT_BASE_RISK[intent] ?? "medium";

  if (confidence < 0.6 && base === "low") return "medium";

  return base;
}

/**
 * Whether this draft must be picked up by a human before the
 * conversation moves forward. Note this is stricter than
 * !canAutoSend — a medium-risk draft is normally NOT a handoff
 * (staff just approves it as usual), but a medical-keyword medium
 * IS a handoff (staff must read it carefully).
 */
export function requiresHandoff(
  intent: Intent,
  riskLevel: RiskLevel,
  confidence: number,
): boolean {
  if (riskLevel === "high") return true;
  if (intent === "escalate") return true;
  if (confidence < 0.5) return true;
  return false;
}

export interface AutoSendOptions {
  envFlagEnabled: boolean;
  conversationOptedIn: boolean;
}

/**
 * Auto-send gate. All four conditions must hold:
 *   1. AI_AUTO_SEND_LOW_RISK env flag is on (global kill switch)
 *   2. The conversation has auto_send_enabled=true (per-customer opt-in)
 *   3. The draft is low risk and does not require handoff
 *   4. The intent is in the safe-to-auto-send allowlist
 */
export function canAutoSend(
  intent: Intent,
  riskLevel: RiskLevel,
  handoffRequired: boolean,
  options: AutoSendOptions,
): boolean {
  if (!options.envFlagEnabled) return false;
  if (!options.conversationOptedIn) return false;
  if (riskLevel !== "low") return false;
  if (handoffRequired) return false;
  if (!AUTO_SENDABLE_INTENTS.includes(intent)) return false;
  return true;
}

// ── Agent state ──────────────────────────────────────────────

export type DogSize = "small" | "medium" | "large" | "unknown";

export type AgentStateStatus =
  | "new"
  | "collecting_details"
  | "awaiting_slot_confirmation"
  | "pending_ai_created"
  | "human_review_required"
  | "closed";

/**
 * Persistent extracted state for the AI receptionist. Stored as jsonb
 * on whatsapp_conversations.agent_state. The shape is a contract with
 * the Edge Function and the dashboard; keep it stable and additive.
 *
 * `null` and `undefined` both mean "not known yet". `null` is used
 * when the field has been explicitly unset; `undefined` is used when
 * it has never been populated. Treat them equivalently when reading.
 */
export interface AgentState {
  customerName?: string | null;
  dogName?: string | null;
  breed?: string | null;
  dogSize?: DogSize | null;
  service?: string | null;
  preferredDay?: string | null;
  preferredTime?: string | null;
  status?: AgentStateStatus | null;
  missingFields?: string[];
}

const KNOWN_AGENT_STATE_KEYS: readonly (keyof AgentState)[] = [
  "customerName",
  "dogName",
  "breed",
  "dogSize",
  "service",
  "preferredDay",
  "preferredTime",
  "status",
  "missingFields",
];

/**
 * Non-destructive merge: a `null`/`undefined` value in the patch does
 * NOT clobber a known value in `prev`. This means a Claude turn that
 * fails to mention the breed doesn't erase the breed we already knew.
 *
 * `missingFields` is replaced atomically (not concatenated) — it's a
 * computed projection, not a log.
 *
 * Returns a fresh object safe to JSON.stringify into the column.
 */
export function mergeAgentState(
  prev: AgentState | null | undefined,
  patch: Partial<AgentState> | null | undefined,
): AgentState {
  const next: AgentState = { ...(prev ?? {}) };
  if (!patch) return next;

  for (const key of KNOWN_AGENT_STATE_KEYS) {
    if (!(key in patch)) continue;
    const value = (patch as Record<string, unknown>)[key];
    if (key === "missingFields") {
      if (Array.isArray(value)) {
        next.missingFields = value.filter((v): v is string => typeof v === "string");
      }
      continue;
    }
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") continue;
    (next as Record<string, unknown>)[key] = value;
  }

  return next;
}

const REQUIRED_BOOKING_FIELDS: readonly (keyof AgentState)[] = [
  "dogName",
  "breed",
  "preferredDay",
  "preferredTime",
];

/**
 * Returns the keys still needed before the agent could propose a
 * booking action. Used by both the dashboard ("what's the AI waiting
 * for?") and the prompt ("ask for these next").
 */
export function extractMissingFields(state: AgentState | null | undefined): string[] {
  const s: AgentState = state ?? {};
  return REQUIRED_BOOKING_FIELDS.filter((key) => {
    const value = s[key as keyof AgentState];
    if (value === undefined || value === null) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    return false;
  });
}

// ── Open-day / time-of-day validators ─────────────────────────
// These mirror the rules already encoded in the system prompt and
// migrations 006/034/035. Defensive duplication: the agent prompt
// could in principle drift; these helpers give us a non-LLM check.

/**
 * Salon is open Monday/Tuesday/Wednesday only. `dateStr` is YYYY-MM-DD.
 */
export function validateOpeningDay(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // Sun=0, Mon=1
  return dow === 1 || dow === 2 || dow === 3;
}

/**
 * Appointment slots run from 08:30 to 13:00 in 30-minute intervals.
 * `time` is HH:MM (24-hour). The salon is open until 15:00, but
 * appointments don't start after 13:00.
 */
export function validateAppointmentTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hh, mm] = time.split(":").map((s) => Number(s));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
  if (mm !== 0 && mm !== 30) return false;
  const minutes = hh * 60 + mm;
  return minutes >= 8 * 60 + 30 && minutes <= 13 * 60;
}

// ── Fallback templates ───────────────────────────────────────
// Used when Claude is unreachable, returns garbage, or AI_ASSISTANT_ENABLED
// is false. Phrasing comes verbatim from the user's tone-of-voice skill
// — keep them close. Every template ends with " X" per the brand
// sign-off rule, uses only emojis from the allowed set
// (🐶 ❤️ 🎓 🐾 😊), and stays under three sentences.

export type FallbackKind =
  | "new_enquiry"
  | "missing_info"
  | "walk_in"
  | "price_check"
  | "handoff"
  | "unknown";

const FALLBACK_TEMPLATES: Readonly<Record<FallbackKind, string>> = {
  new_enquiry:
    "Hey, thanks for sniffing us out! 🐾 Booking a full groom? Just let me know your pup's name, breed, and ideal day/time 😊 X",
  missing_info:
    "Just need a couple of bits 😊\n• Name\n• Breed\n• Ideal day/time\nThen I'll get that sorted X",
  walk_in:
    "These are walk-in only — just pop in anytime between 08:30 and 13:00 (Mon, Tue or Wed), done while you wait 😊 X",
  price_check:
    "Guide prices depend on size and coat — full grooms start from £42 small, £46 medium, £60 large. Final price is confirmed after the groom 😊 X",
  handoff:
    "Hey, just catching up on messages now 😊 — I'll get one of the team to pick this up properly X",
  unknown:
    "Could you send me your pup's name, breed, and what you're looking to book please? 😊 X",
};

/**
 * Pick a brand-voiced template for a given intent + state. Uses the
 * customer's first name when known. The agent uses this when Claude
 * is unreachable; the dashboard uses it as a "suggested reply" when
 * staff want to skip writing from scratch.
 */
export function fallbackReplyForIntent(
  intent: Intent | FallbackKind,
  state?: AgentState | null,
): string {
  const kind = intentToFallbackKind(intent);
  const template = FALLBACK_TEMPLATES[kind];
  const name = state?.customerName?.trim();
  if (!name) return template;

  // "Hey, thanks ..." → "Hey [Name], thanks ..."
  // Only patch the new_enquiry/handoff templates that lead with "Hey" or "Hey,";
  // the others are intent-specific answers where a name prefix would feel forced.
  if (kind === "new_enquiry" || kind === "handoff") {
    return template.replace(/^Hey,/, `Hey ${name},`);
  }
  return template;
}

function intentToFallbackKind(input: Intent | FallbackKind): FallbackKind {
  if (input in FALLBACK_TEMPLATES) return input as FallbackKind;
  switch (input) {
    case "greeting":
      return "new_enquiry";
    case "booking_query":
    case "booking_propose":
      return "missing_info";
    case "faq":
      return "price_check"; // safest specific fallback for an FAQ we couldn't classify
    case "escalate":
      return "handoff";
    case "smalltalk":
    case "confirm_time":
    case "booking_confirm":
    case "booking_change":
    case "booking_cancel":
    case "other":
    default:
      return "unknown";
  }
}

/**
 * Best-effort intent detection from a raw message. Used only when the
 * Claude response is unparseable, to choose a sensible fallback. Order
 * matters — first match wins.
 */
export function guessIntentFromText(messageText: string | null | undefined): Intent {
  const text = (messageText ?? "").toLowerCase();
  if (!text.trim()) return "other";

  if (containsAny(text, MEDICAL_KEYWORDS) || containsAny(text, COMPLAINT_KEYWORDS)) {
    return "escalate";
  }
  if (isWalkInService(text)) return "faq";
  if (/\b(price|cost|how much|£)\b/.test(text)) return "faq";
  // Order matters: cancel/reschedule must run before the broad
  // booking_propose pattern, otherwise "cancel today's appointment"
  // hits "appointment" and routes to booking_propose.
  if (/\bcancel\w*\b/.test(text)) return "booking_cancel";
  if (/\b(reschedul\w*|move|change|swap)\b/.test(text)) return "booking_change";
  if (/\b(book|appointment|slot|available|availability)\b/.test(text)) return "booking_propose";
  if (/\b(thanks|thank you|cheers|on my way|coming|omw)\b/.test(text)) return "smalltalk";
  if (/\b(hi|hey|hello|morning|afternoon)\b/.test(text)) return "greeting";
  return "other";
}
