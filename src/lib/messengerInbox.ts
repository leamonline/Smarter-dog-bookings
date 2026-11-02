// Both flags default off. The edge function reads MESSENGER_INBOX_ENABLED.
// This one only changes what the staff inbox shows, and it is baked in at
// build time. Set it in Vercel after the migration is applied, then redeploy.

export function isMessengerInboxEnabled(
  value: string | boolean | undefined = import.meta.env.VITE_MESSENGER_INBOX_ENABLED,
): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

/** Must stay off until Meta has approved the HUMAN_AGENT feature for this Page. */
export function isMessengerHumanAgentEnabled(
  value: string | boolean | undefined = import.meta.env.VITE_MESSENGER_HUMAN_AGENT_ENABLED,
): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function hideMessengerUntilEnabled<T extends { channel?: string | null }>(
  rows: T[],
  enabled = isMessengerInboxEnabled(),
): T[] {
  if (enabled) return rows;
  return rows.filter((row) => row.channel !== "messenger");
}
