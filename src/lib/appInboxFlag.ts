/**
 * The staff inbox keeps today's WhatsApp behaviour unless this is exactly "1"
 * at build time. Unset, "true" and "0" all leave the inbox unchanged.
 * Turn it on only after migration 20261122170000 is applied on that environment.
 */
export function isAppInboxEnabled(
  flag: string | undefined = import.meta.env.VITE_APP_INBOX_ENABLED,
): boolean {
  return flag === "1";
}
