/**
 * Fixture badge counts for the offline E2E harness. Only honoured when the
 * app is forced offline, so a stray VITE_E2E_* value can never leak into a
 * real session.
 */
export function e2eFixtureCount(rawValue: string | number | null | undefined, forceOffline: boolean): number {
  if (!forceOffline) return 0;
  const count = Number(rawValue || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}
