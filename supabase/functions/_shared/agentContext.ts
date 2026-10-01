/** Pure calendar helpers: all customer-relative dates use Europe/London. */
export function agentCalendar(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
  return {
    today,
    tomorrow: addCalendarDays(today, 1),
    weekday: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" }).format(now),
  };
}
export function addCalendarDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function contextHorizon(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 730 ? value : 180;
}

export type BookEntryOutcome =
  | { kind: "accepted"; reason: "endpoint_accepted" }
  | { kind: "refused"; reason: string }
  | { kind: "uncertain"; reason: string };

/** Only documented pre-send gate refusals establish definite non-send. */
export async function bookEntryOutcome(response: Response): Promise<BookEntryOutcome> {
  let body: { ok?: unknown; reason?: unknown };
  try { body = await response.json(); }
  catch { return { kind: "uncertain", reason: "invalid_response" }; }
  if (!body || typeof body !== "object") return { kind: "uncertain", reason: "invalid_response" };
  if (response.ok && body.ok === true) return { kind: "accepted", reason: "endpoint_accepted" };
  const refusals = ["global_disabled", "global_lookup_failed", "customer_disabled", "customer_lookup_failed"];
  if (response.status === 409 && typeof body.reason === "string" && refusals.includes(body.reason)) {
    return { kind: "refused", reason: body.reason };
  }
  // 502 may follow a provider timeout, rejection or post-send persistence failure.
  return { kind: "uncertain", reason: `http_${response.status}` };
}
