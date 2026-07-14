export function e2eFixtureCount(rawValue, forceOffline) {
  if (!forceOffline) return 0;
  const count = Number(rawValue || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}
