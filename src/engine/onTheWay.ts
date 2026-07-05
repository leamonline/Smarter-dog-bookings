// ============================================================
// "Owner on the way" detection — pure TS, zero React (improvement #2).
//
// A read-only, keyword-based derivation: scan an owner's recent INBOUND WhatsApp
// messages for on-the-way phrases and surface a soft "on the way" chip on the
// Today collection queue. It NEVER touches the WhatsApp agent, auto-send, gates,
// or agentRisk.ts — it only reads message text. A soft nudge, so the odd
// false-positive is acceptable; negations ("can't make it") are guarded.
// ============================================================

/** Phrases that signal the customer is en route. */
const ON_THE_WAY_CUES: RegExp[] = [
  /\bon (my|the|our) way\b/,
  /\bomw\b/,
  /\b(en|on) route\b/,
  /\bnearly (there|here)\b/,
  /\balmost (there|here)\b/,
  /\bjust (leaving|left|setting off|set off)\b/,
  /\bsetting off\b/,
  /\bbe (there|with you) (soon|shortly|in)\b/,
  /\b(there|here) in \d+\s*(m|min|mins|minute|minutes)\b/,
  /\b\d+\s*(min|mins|minute|minutes) (away|out)\b/,
  /\bround the corner\b/,
  /\b(pulling up|outside|out front|here now)\b/,
  /\bheading (over|your way|to (get|collect|pick))\b/,
  /\bcoming (now|over|to (get|collect|pick))\b/,
];

/** Phrases that mean the opposite — never flag these as "on the way". */
const NEGATIONS: RegExp[] = [
  /\bnot on (my|the) way\b/,
  /\b(can'?t|cannot|won'?t|unable to) (make|come|collect|get|pick)\b/,
  /\b(have to|need to|going to have to|might have to) (cancel|reschedule|rearrange|move)\b/,
  /\bnot (coming|going to make|able to)\b/,
];

export function detectOnTheWay(text: string | null | undefined): boolean {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return false;
  if (NEGATIONS.some((re) => re.test(t))) return false;
  return ON_THE_WAY_CUES.some((re) => re.test(t));
}

export interface InboundMessage {
  direction: "inbound" | "outbound" | string;
  body: string | null;
  created_at: string;
}

export interface OnTheWaySignal {
  at: string;
  text: string;
  minutesAgo: number;
}

/** How recent an on-the-way message must be to still count (minutes). */
export const ON_THE_WAY_WINDOW_MINUTES = 120;

/**
 * The most recent inbound on-the-way message within the window, or null. Only
 * inbound (customer) messages count — an outbound salon message never does.
 */
export function latestOnTheWaySignal(
  messages: InboundMessage[],
  now: Date = new Date(),
  windowMinutes: number = ON_THE_WAY_WINDOW_MINUTES,
): OnTheWaySignal | null {
  let best: OnTheWaySignal | null = null;
  for (const m of messages) {
    if (m.direction !== "inbound") continue;
    const ts = Date.parse(m.created_at);
    if (Number.isNaN(ts)) continue;
    const minutesAgo = Math.floor((now.getTime() - ts) / 60000);
    if (minutesAgo < 0 || minutesAgo > windowMinutes) continue;
    if (!detectOnTheWay(m.body)) continue;
    if (!best || minutesAgo < best.minutesAgo) {
      best = { at: m.created_at, text: (m.body || "").trim(), minutesAgo };
    }
  }
  return best;
}
