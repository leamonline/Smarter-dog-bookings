/** Reporting includes today so far and the preceding days - 1 UTC dates. */
export function measurementWindow(days: number, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid measurement window");
  }
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { start: start.toISOString(), end: now.toISOString() };
}
