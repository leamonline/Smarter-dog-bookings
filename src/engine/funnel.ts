// ============================================================
// Booking-wizard funnel — pure TS, zero React.
//
// The customer wizard logs each step it reaches (booking_funnel_events, one
// session_id per run). This turns those events into a drop-off funnel: how many
// sessions reached each step and where they fall away. Counting is by *furthest
// step reached* per session, so a dropped intermediate log can't make the funnel
// non-monotonic.
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
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function computeFunnelStats(rows: FunnelEventRow[], days: number, today: Date = new Date()): FunnelStats {
  const todayStr = ymd(today);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = ymd(cutoff);

  // Furthest step ordinal reached per session, within the window.
  const maxBySession: Record<string, number> = {};
  for (const r of rows) {
    if (!r.created_at) continue;
    const d = ymd(new Date(r.created_at));
    if (!(d > cutoffStr && d <= todayStr)) continue;
    const ord = STEP_ORDINAL[r.step];
    if (ord === undefined) continue;
    if (maxBySession[r.session_id] === undefined || ord > maxBySession[r.session_id]) {
      maxBySession[r.session_id] = ord;
    }
  }

  const maxes = Object.values(maxBySession);
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
  };
}
