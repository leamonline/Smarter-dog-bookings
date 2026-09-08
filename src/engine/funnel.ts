import { measurementWindow } from "./measurementWindow";

// ============================================================
// Booking-wizard funnel — pure TS, zero React.
//
// The customer wizard logs each step it completes (booking_funnel_events, one
// session_id per booking attempt — persisted by src/lib/funnelSession.ts):
// "started" on opening the wizard, each select_* as the customer advances past
// that step, "confirm" on the confirm click, "booked" on success. This turns
// those events into a drop-off funnel: how many sessions reached each step and
// where they fall away. Counting is by *furthest step reached* per session, so
// a dropped intermediate log can't make the funnel non-monotonic.
// ============================================================

export const FUNNEL_STEPS: Array<{ step: string; label: string }> = [
  { step: "started", label: "Opened the wizard" },
  { step: "select_dogs", label: "Chose dogs" },
  { step: "select_service", label: "Chose service" },
  { step: "select_date", label: "Chose date" },
  { step: "select_slot", label: "Chose time" },
  { step: "confirm", label: "Reviewed booking" },
  { step: "booked", label: "Booked" },
];

const STEP_ORDINAL: Record<string, number> = Object.fromEntries(FUNNEL_STEPS.map((s, i) => [s.step, i]));
const BOOKED_ORDINAL = STEP_ORDINAL["booked"];

export interface FunnelEventRow {
  session_id: string;
  step: string;
  created_at: string;
}

export interface FunnelStep {
  step: string;
  label: string;
  sessions: number;
  pctOfStarted: number;
  dropFromPrev: number;
}

export interface FunnelStats {
  totalSessions: number;
  completed: number;
  completionPct: number;
  steps: FunnelStep[];
  quality: { missingStarts: number; missingIntermediate: number; repeatedSteps: number; invalidRows: number };
}

export function computeFunnelStats(rows: FunnelEventRow[], days: number, today: Date = new Date()): FunnelStats {
  const window = measurementWindow(days, today);
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const quality = { missingStarts: 0, missingIntermediate: 0, repeatedSteps: 0, invalidRows: 0 };
  const bySession = new Map<string, Set<number>>();
  for (const row of rows) {
    const time = Date.parse(row.created_at);
    if (!Number.isFinite(time)) { quality.invalidRows++; continue; }
    if (time < start || time > end) continue;
    // These diagnostic events are valid, but do not represent step reach.
    if (row.step === "confirm_failed") continue;
    if (!row.session_id?.trim() || !Object.hasOwn(STEP_ORDINAL, row.step)) {
      quality.invalidRows++;
      continue;
    }
    const ordinal = STEP_ORDINAL[row.step];
    const seen = bySession.get(row.session_id) ?? new Set<number>();
    if (seen.has(ordinal)) quality.repeatedSteps++;
    seen.add(ordinal);
    bySession.set(row.session_id, seen);
  }
  const maxes: number[] = [];
  for (const seen of bySession.values()) {
    if (!seen.has(0)) { quality.missingStarts++; continue; }
    const furthest = Math.max(...seen);
    if (seen.size < furthest + 1) quality.missingIntermediate++;
    maxes.push(furthest);
  }
  const totalSessions = maxes.length;
  const completed = maxes.filter((m) => m >= BOOKED_ORDINAL).length;

  const steps: FunnelStep[] = FUNNEL_STEPS.map((s, i) => {
    const sessions = maxes.filter((m) => m >= i).length;
    return { step: s.step, label: s.label, sessions, pctOfStarted: 0, dropFromPrev: 0 };
  });
  // Fill pct-of-started (denominator = the "started" count) + drop from prev step.
  const startedCount = steps[0]?.sessions || 0;
  steps.forEach((s, i) => {
    s.pctOfStarted = startedCount > 0 ? (s.sessions / startedCount) * 100 : 0;
    s.dropFromPrev = i > 0 ? steps[i - 1].sessions - s.sessions : 0;
  });

  return {
    totalSessions,
    completed,
    completionPct: totalSessions > 0 ? (completed / totalSessions) * 100 : 0,
    steps,
    quality,
  };
}
