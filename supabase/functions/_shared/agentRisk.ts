import { mergeDogMemory, type AgentDogMemory } from "./agentDogMemory.ts";
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

// "The booking page won't let me" — a customer telling us self-service has
// failed them. Kept separate from the keyword lists above because these are
// phrases, not word fragments, and because the response is different: the
// agent must NOT answer with the portal link (that is the thing they are
// stuck on) or the tap-to-book prompt that leads to it. The phrasings were
// chosen from the kinds of message customers actually sent, Jun–Oct 2026.
export const PORTAL_TROUBLE_PATTERNS: readonly RegExp[] = [
  // "won't let me book", "it ont let me book", "not letting me log in", "wont let
  // me ... add". The booking-page word must follow closely: on its own "won't
  // let me" is everyday speech ("he won't let me brush him", "work won't let
  // me leave early") and must keep its normal route.
  /\b(?:won'?t|wont|will not|ont|doesn'?t|does not|isn'?t|not) (?:let|letting|allow|allowing) me\b[^.?!]{0,30}\b(?:book|log ?in|login|sign|add|put|enter|register|app|site|website|online|portal|page|system|post ?code|address)/,
  // "can't log in", "cant login", "not letting me log in", "can't get on the app"
  // "can't log in" / "can't sign in" are unambiguous on their own.
  /\bcan'?t (?:log ?in|sign ?in)\b/,
  // "can't get on", "can't seem to get on the app": everyday on their own ("I
  // can't get in until 10", "I can't seem to get him to eat"), so the
  // booking-page word must follow closely.
  /\bcan'?t (?:get (?:on|in|onto|into)|(?:seem|seam) to (?:get|log|book))\b[^.?!]{0,30}\b(?:app|site|website|online|portal|page|system|account|log ?in|login|book)/,
  // "the website isn't working", "system isnt working", "app not working"
  /\b(?:website|web site|site|app|portal|system|booking page|online booking|link)\b[^.?!]{0,20}\b(?:isn'?t|is not|not|doesn'?t|does not|won'?t) (?:working|work|load|loading)\b/,
  // "I can't book in on the App", "can't book her online"
  /\bcan'?t book\b[^.?!]{0,30}\b(?:app|website|web site|site|portal|online|booking page)\b/,
  // "keeps sending me to sign up", "keeps throwing me off"
  /\bkeeps? (?:sending|throwing|kicking|taking|bringing|logging) me\b/,
  // "trying to book online", "tried to book on the website", "trying to book on your app"
  /\b(?:trying|tried|try) to book\b[^.?!]{0,40}\b(?:online|on ?line|website|web site|site|app|portal|booking page|system)\b/,
  // address and postcode lookup failures
  /\b(?:couldn'?t|could not|can'?t|cannot|won'?t|wont) (?:find|accept|take)\b[^.?!]{0,20}\b(?:address|post ?code)\b/,
  // the size wall: "it's asking us to contact you to enter his size"
  /\b(?:asking|asks|says|said)\b[^.?!]{0,40}\b(?:contact|message|tell|let you know)\b[^.?!]{0,40}\b(?:size|weight)\b/,
  /\b(?:says|said)\b[^.?!]{0,10}\bneed to (?:know|tell|enter)\b[^.?!]{0,30}\b(?:size|weight)\b/,
  // Trouble described rather than named: "struggling with your app", "having
  // problems booking online", "need help with the app", "finding it confusing
  // using your booking system". Struggles are everyday too ("struggling with
  // his skin", "had trouble finding parking on site"), so the booking-page word
  // must follow closely and be pointed at ("the/your/this app"), or be "online".
  // A bare "site" is a place as often as a page ("parking at the site"), so
  // only "website" or "booking site" count.
  /\b(?:struggl\w*|(?:having|have|had|got|getting) (?:some |a few |a lot of )?(?:trouble|problems?|issues?|difficulty|a hard time)|(?:need|needs|want) (?:some )?help (?:with|using|on)|finding it (?:really |so |very |a bit )?(?:hard|difficult|confusing|tricky))\b[^.?!]{0,30}\b(?:(?:the|this|your|ur|my|that) (?:new )?(?:booking site|(?:booking )?(?:app|website|web site|portal|page|system|link|form))|online|on ?line)\b/,
];

/**
 * Detect a customer reporting that the booking website / app has failed
 * them. Pure, deterministic; curly apostrophes are normalised first because
 * phones send them by default.
 */
export function isPortalTrouble(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  return PORTAL_TROUBLE_PATTERNS.some((re) => re.test(normalise(messageText)));
}

/** Lower-case with straight apostrophes, the shape every phrase pattern below expects. */
function normalise(messageText: string): string {
  return messageText.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'");
}

// \u2500\u2500 Messages that need a person, not a script \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Found in the October 2026 inbox review. Each of these carries a booking
// word ("appointment", "reschedule", "cancellation") that the intent
// heuristic used to act on, so the customer got a script that answered a
// different question: the tap-to-book prompt sent to someone standing at a
// locked door, the automated 24-hour cutoff reply sent twice to someone
// asking why nobody had replied, "I can't see any upcoming grooms" sent to
// someone asking whether a cancellation might free a space.
//
// Like PORTAL_TROUBLE_PATTERNS these are phrases, not word fragments, and
// each is paired with everyday wording it must NOT catch (see the tests).
// No customer text is reproduced here.

// "I'm at the salon and it's closed": the customer has physically arrived
// and found no one. Needs a presence phrase AND a closed phrase, so "are you
// closed on Monday?" (hours question) and "I'll wait outside" (collection
// chat) each keep their normal route.
const PRESENCE_RE =
  /\b(?:(?:i'?m|i am|we'?re|we are) (?:here|outside|at the|at your|stood|standing|waiting|parked)|(?:i|we)(?:'?ve)? (?:just )?(?:arrived|got here|got to the|turned up|came|come)\b|(?:arrived|turned up|got here|got to the (?:salon|shop)|here for (?:my|our|his|her|the)|outside (?:the|your)|waiting outside|stood outside|standing outside|at the door|at your door)\b)/;
const CLOSED_RE =
  /\b(?:closed|shut|locked|not open|isn'?t open|no ?one(?:'?s| is)? (?:here|there|in|about|answering)|nobody(?:'?s| is)? (?:here|there|in|about|answering)|no answer|not answering|lights (?:are )?off)\b/;

/**
 * A customer reporting that they turned up and the salon was closed. This is
 * a service-recovery complaint even when it contains no complaint keyword.
 */
export function isServiceRecovery(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  const text = normalise(messageText);
  return PRESENCE_RE.test(text) && CLOSED_RE.test(text);
}

// "I already messaged you about this": the customer is chasing a request we
// did not answer. Whatever the request was, repeating the automated answer
// is the one thing that must not happen.
export const CHASING_PATTERNS: readonly RegExp[] = [
  // "I already sent a message last week", "we've messaged twice", "I asked on Friday"
  /\b(?:i|we)(?:'?ve)? (?:already |did )?(?:sent|messaged|texted|asked|emailed|wrote|rang|called|phoned)\b[^.?!]{0,40}\b(?:message|earlier|last|yesterday|ago|before|twice|again|previously|on (?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/,
  /\bstill waiting\b/,
  /\b(?:not|haven'?t|havent|never) heard (?:back|anything|from)\b/,
  /\b(?:did|have) you (?:get|got|see|seen|receive|received|read) my (?:message|text|email|whatsapp|last|earlier|previous)\b/,
  /\bany (?:update|reply|response|answer)\b[^.?!]{0,30}\b(?:message|text|email|request|earlier|previous|last)\b/,
  /\bno (?:reply|response|answer) (?:yet|to|from)\b/,
  /\b(?:tried|trying) (?:to )?(?:ring|call|phone|calling|ringing|phoning)\b/,
  /\bvoicemail\b/,
  /\bchasing\b/,
];

/** A customer chasing an earlier message that got no reply. */
export function isChasing(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  const text = normalise(messageText);
  return CHASING_PATTERNS.some((re) => re.test(text));
}

export type HumanNeededKind = "service_recovery" | "chasing";

/**
 * Which "needs a person" situation a message describes, if any. Service
 * recovery wins when both apply: someone locked out who also mentions an
 * earlier message is still, first, locked out.
 */
export function humanNeededKind(messageText: string | null | undefined): HumanNeededKind | null {
  if (isServiceRecovery(messageText)) return "service_recovery";
  if (isChasing(messageText)) return "chasing";
  return null;
}

// "If you have a cancellation, could you squeeze her in?" is a request for
// space, not a request to cancel. Checked before the cancel keyword.
export const CANCELLATION_SPACE_PATTERNS: readonly RegExp[] = [
  /\b(?:if|in case|should|when|whenever) (?:you|there|anyone|anybody|someone|somebody|a|of)\b[^.?!]{0,25}\bcancel/,
  /\bany cancell?ations?\b/,
  /\bcancell?ations? (?:list|come up|comes up|coming up)\b/,
  /\b(?:squeeze|fit) (?:me|her|him|us|them|[a-z]+) in\b/,
  /\bwait(?:ing)? ?list\b/,
];

/** A customer asking whether someone else's cancellation might free a space. */
export function isCancellationSpaceRequest(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  const text = normalise(messageText);
  return CANCELLATION_SPACE_PATTERNS.some((re) => re.test(text));
}

// Weekends, evenings, "after work": the salon never opens then, so the
// tap-to-book prompt can only lead to a form with nothing they asked for. A
// person needs to say so and offer what we do have.
const OUT_OF_HOURS_RE =
  /\b(?:weekends?|saturdays?|sundays?|evenings?|after (?:work|school|lunch(?:time)?|(?:1[0-2]|[1-9]) ?pm|[4-9]\b|four|five|six|seven|eight)|late (?:afternoon|opening|appointments?)|out of hours|bank holidays?)\b/;

/** A request for a time the salon is never open. */
export function isOutOfHoursRequest(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  return OUT_OF_HOURS_RE.test(normalise(messageText));
}

// A groom that also mentions nails or glands is a booking with an add-on,
// not a walk-in enquiry. Only groom-type service words count: "book him in
// for a nail clip" stays a walk-in, because nail clips are never booked.
const GROOM_SERVICE_RE = /\b(?:groom\w*|bath|de-?shed\w*|tidy|cut|wash)\b/;

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
export interface AgentCorrection {
  field: "preferredDay" | "preferredTime" | "service";
  value: string | null;
  evidence: string;
}

export interface AgentState {
  dogs?: AgentDogMemory[];
  corrections?: AgentCorrection[];
  customerName?: string | null;
  customerSurname?: string | null;
  dogName?: string | null;
  breed?: string | null;
  dogSize?: DogSize | null;
  dogAge?: string | null;
  alerts?: string[] | null;
  coatCondition?: string | null;
  service?: "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom" | null;
  preferredDay?: string | null;
  preferredTime?: string | null;
  status?: AgentStateStatus | null;
  missingFields?: string[];
}

const KNOWN_AGENT_STATE_KEYS: readonly (keyof AgentState)[] = [
  "customerName",
  "customerSurname",
  "dogName",
  "breed",
  "dogSize",
  "dogAge",
  "alerts",
  "coatCondition",
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
    if (key === "alerts") {
      if (Array.isArray(value)) {
        // Apply the same caps as parseExtractedState so non-parser callers
        // (tests, dashboard mutations, future RPCs) can't push oversized
        // entries through. Defence-in-depth — the parser sanitises today.
        next.alerts = value
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim().slice(0, 100))
          .slice(0, 10);
      }
      continue;
    }
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") continue;
    (next as Record<string, unknown>)[key] = value;
  }

  if (Array.isArray(patch.dogs)) next.dogs = mergeDogMemory(prev?.dogs, patch.dogs);
  if (Array.isArray(patch.corrections)) {
    const corrections = patch.corrections.filter(c =>
      c && ["preferredDay", "preferredTime", "service"].includes(c.field) &&
      (c.value === null || (typeof c.value === "string" && c.value.trim().length > 0)) &&
      typeof c.evidence === "string" && c.evidence.trim().length > 0 &&
      (c.field !== "service" || c.value === null || ["full-groom", "bath-and-brush", "bath-and-deshed", "puppy-groom"].includes(c.value))
    ).slice(0, 5).map(c => ({...c, value: c.value === null ? null : c.value.trim().slice(0, 200), evidence: c.evidence.slice(0, 200)}));
    for (const correction of corrections) (next as Record<string, unknown>)[correction.field] = correction.value;
    if (corrections.length) next.corrections = [...(prev?.corrections ?? []), ...corrections].slice(-10);
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
  | "portal_trouble"
  | "service_recovery"
  | "opt_out"
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
  // Deliberately no link: the customer has just told us the link failed them.
  portal_trouble:
    "Sorry the booking page is being awkward 🐾 No need to keep trying, we'll book this in for you here — just tell me which pup and roughly when suits 😊 X",
  // The customer turned up and found us closed. Apology first, a person
  // second, and no booking prompt: they already had a booking.
  service_recovery:
    "I'm so sorry, that's not how a visit to us should go 🐾 One of the team is picking this up right now and will come back to you here as soon as they can X",
  // The customer asked us to stop messaging them. Acknowledge once, promise
  // nothing else, and leave the door open the way it really opens: nothing
  // re-enables messages automatically; a member of staff unticks the opt-out
  // when the customer asks. Staff-sent only: whatsapp-send refuses an
  // AI-initiated message to an opted-out number.
  opt_out:
    "No problem at all — we've stopped WhatsApp messages to this number. If you change your mind, just let us know and the team will switch them back on 🐾 X",
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

export interface CanAutoBookInput {
  intent: Intent;
  riskLevel: RiskLevel;
  confidence: number;
  dogSize: "small" | "medium" | "large" | "unknown" | null;
  customerIsKnown: boolean;
  conversationState: "ai_handling" | "human_takeover" | "snoozed" | "closed" | string;
  envFlagEnabled: boolean;
  conversationOptedIn: boolean;
  breedKnown: boolean;
}

/**
 * Returns true iff every autonomy gate passes for an autonomous booking
 * action (create / reschedule / cancel). The agent calls this once it
 * has Claude's draft + classifier output; on true it emits the
 * awaiting_customer_confirm flow, on false it emits a legacy `pending`
 * action that the staff inbox can approve.
 */
export function canAutoBook(input: CanAutoBookInput): boolean {
  if (!input.envFlagEnabled) return false;
  if (!input.conversationOptedIn) return false;
  if (!input.customerIsKnown) return false;
  if (input.confidence < 0.85) return false;
  if (input.riskLevel !== "low") return false;
  if (input.conversationState !== "ai_handling") return false;
  if (!input.breedKnown) return false;
  const okSizes = new Set(["small", "medium"]);
  if (!input.dogSize || !okSizes.has(input.dogSize)) return false;
  const okIntents = new Set<Intent>(["booking_propose", "booking_change", "booking_cancel"]);
  if (!okIntents.has(input.intent)) return false;
  return true;
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
  // Someone at a closed salon, or chasing an unanswered message, needs a
  // person. Checked before every booking word below, because those are
  // exactly the words such a message contains ("my 1pm appointment",
  // "asking to reschedule").
  if (humanNeededKind(text)) return "escalate";
  // A walk-in mention inside a groom booking ("groom and nail trim") is a
  // booking with an add-on; only a bare walk-in enquiry is the FAQ.
  if (isWalkInService(text) && !GROOM_SERVICE_RE.test(text)) return "faq";
  if (/\b(price|cost|how much|£)\b/.test(text)) return "faq";
  // Weekends, evenings, after work: hours we never open, so an hours answer
  // from a person, not a booking form that cannot offer them.
  if (isOutOfHoursRequest(text)) return "faq";
  // Salon-info FAQs: hours/opening, address/parking, payment methods.
  // Kept narrow so it doesn't swallow the explicit booking phrases below.
  if (/\b(open|opening|close|closing|hours|when (?:are|do) you|what time|address|parking|where are you|do you take|card or cash|payment)\b/.test(text)) {
    return "faq";
  }
  // "If you have a cancellation..." asks for space; it must not reach the
  // cancel keyword below, which would open the customer's own bookings.
  if (isCancellationSpaceRequest(text)) return "booking_query";
  // Order matters: cancel/reschedule must run before the broad
  // booking_propose pattern, otherwise "cancel today's appointment"
  // hits "appointment" and routes to booking_propose.
  if (/\bcancel\w*\b/.test(text)) return "booking_cancel";
  if (/\b(reschedul\w*|move|change|swap)\b/.test(text)) return "booking_change";
  if (/\b(book|booking|appointment|slot|available|availability)\b/.test(text)) return "booking_propose";
  if (/\b(thanks|thank you|cheers|on my way|coming|omw)\b/.test(text)) return "smalltalk";
  if (/\b(hi|hey|hello|morning|afternoon)\b/.test(text)) return "greeting";
  return "other";
}
