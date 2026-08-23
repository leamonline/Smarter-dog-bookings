// ============================================================
// Booking-funnel session identity (improvement #4) — pure TS, zero React.
//
// One session_id per *booking attempt*, not per mount or render. The record
// lives in sessionStorage so it survives a wizard remount (auth token
// refresh, route change) and a page refresh, but dies with the tab — which
// is what "one attempt" means. It is cleared explicitly when a booking
// completes, so the next genuine attempt mints a fresh id.
//
// The record also carries the two ordering guards the funnel report needs:
// a monotonic stepIndex handed out per logged event, and a startedLogged
// flag written in the same storage write that mints the session, so
// "started" can never be logged twice for one attempt however many times
// the wizard remounts.
//
// Storage failures (privacy mode, quota, no DOM) degrade to a module-level
// in-memory record: telemetry quality drops to per-page-load, and the
// wizard never notices.
// ============================================================

export const FUNNEL_SESSION_KEY = "sd.funnel.session";

export interface FunnelSessionRecord {
  id: string;
  /** Next step index to hand out; strictly increases across the attempt. */
  stepIndex: number;
  startedLogged: boolean;
}

export interface FunnelStepClaim {
  sessionId: string;
  stepIndex: number;
}

let memoryFallback: FunnelSessionRecord | null = null;

function mintId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the manual v4 below */
  }
  // Non-secure contexts only. Telemetry-grade uniqueness is enough here.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidRecord(value: unknown): value is FunnelSessionRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<FunnelSessionRecord>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.stepIndex === "number" &&
    Number.isInteger(record.stepIndex) &&
    record.stepIndex >= 0 &&
    typeof record.startedLogged === "boolean"
  );
}

function readRecord(): FunnelSessionRecord | null {
  let raw: string | null;
  try {
    const store = globalThis.sessionStorage;
    if (!store) return memoryFallback;
    raw = store.getItem(FUNNEL_SESSION_KEY);
  } catch {
    return memoryFallback;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    return null; // corrupt record — treat as absent so a fresh one is minted
  }
}

function writeRecord(record: FunnelSessionRecord): void {
  memoryFallback = record;
  try {
    globalThis.sessionStorage?.setItem(FUNNEL_SESSION_KEY, JSON.stringify(record));
  } catch {
    /* quota / privacy mode — the memory fallback already holds it */
  }
}

/** Read the current attempt's record, minting (and persisting) one if absent. */
export function getOrCreateFunnelSession(): FunnelSessionRecord {
  const existing = readRecord();
  if (existing) return existing;
  const minted: FunnelSessionRecord = { id: mintId(), stepIndex: 0, startedLogged: false };
  writeRecord(minted);
  return minted;
}

/**
 * Claim one funnel event for the current attempt: returns the stable
 * session id plus the monotonic index to send as p_step_index, or null when
 * the event must not be logged ("started" on an attempt that already logged
 * it). Minting, the startedLogged flag and the index bump all land in one
 * storage write, so a remount between calls cannot fork the attempt.
 */
export function claimFunnelStep(step: string): FunnelStepClaim | null {
  const record = getOrCreateFunnelSession();
  if (step === "started") {
    if (record.startedLogged) return null;
    record.startedLogged = true;
  }
  const claim: FunnelStepClaim = { sessionId: record.id, stepIndex: record.stepIndex };
  record.stepIndex += 1;
  writeRecord(record);
  return claim;
}

/**
 * End the attempt (booking completed, or an explicit "book another" reset):
 * the next claim mints a fresh session.
 */
export function clearFunnelSession(): void {
  memoryFallback = null;
  try {
    globalThis.sessionStorage?.removeItem(FUNNEL_SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}
