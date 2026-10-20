// Daily pipeline health line for the ops Slack channel (#1007).
//
// COUNTS ONLY. The input type has numbers and trigger-type labels and nothing
// else, so a customer name, phone number or message cannot reach Slack from
// here without a type change. Trigger labels come from notification_log and
// are filtered to a safe shape before rendering, in case a free-text value
// ever lands in that column.

export interface PipelineHealthCounts {
  /** notification_log rows still 'pending' past the threshold. */
  pending_stuck: number;
  /** notification_log rows 'failed' in the window, by trigger_type. */
  failed_by_trigger: Record<string, number>;
  /** whatsapp_events with processing_status 'failed' in the window. */
  whatsapp_events_failed: number;
  /** cron.job_run_details rows with status 'failed' in the window (null: not readable). */
  cron_failed: number | null;
  /** net._http_response rows with status_code >= 400 still held (null: not readable). */
  http_errors: number | null;
  /** notification_log SMS rows 'sent' in the window. */
  sms_sent: number;
}

const SAFE_LABEL = /^[a-z][a-z0-9_]{0,39}$/;

function count(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

/** Narrow whatever the RPC returned to the counts-only shape. */
export function parsePipelineHealthCounts(raw: unknown): PipelineHealthCounts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const failed: Record<string, number> = {};
  const byTrigger = r.failed_by_trigger;
  if (byTrigger && typeof byTrigger === "object") {
    for (const [label, n] of Object.entries(byTrigger as Record<string, unknown>)) {
      const key = SAFE_LABEL.test(label) ? label : "other";
      failed[key] = (failed[key] ?? 0) + count(n);
    }
  }
  const nullable = (v: unknown) => (v === null || v === undefined ? null : count(v));
  return {
    pending_stuck: count(r.pending_stuck),
    failed_by_trigger: failed,
    whatsapp_events_failed: count(r.whatsapp_events_failed),
    cron_failed: nullable(r.cron_failed),
    http_errors: nullable(r.http_errors),
    sms_sent: count(r.sms_sent),
  };
}

export function pipelineHealthIsClean(c: PipelineHealthCounts): boolean {
  const failedTotal = Object.values(c.failed_by_trigger).reduce((a, b) => a + b, 0);
  return c.pending_stuck === 0 && failedTotal === 0 && c.whatsapp_events_failed === 0 &&
    (c.cron_failed ?? 0) === 0 && (c.http_errors ?? 0) === 0;
}

/** One Slack line. Example:
 *  ":large_green_circle: Pipeline 24h: stuck 0 · failed 0 · WhatsApp events failed 0 · cron failed 0 · HTTP errors 0 · SMS sent 12" */
export function buildPipelineHealthLine(c: PipelineHealthCounts, windowHours: number): string {
  const failedEntries = Object.entries(c.failed_by_trigger).filter(([, n]) => n > 0).sort();
  const failedTotal = failedEntries.reduce((a, [, n]) => a + n, 0);
  const failedDetail = failedEntries.length
    ? ` (${failedEntries.map(([label, n]) => `${label} ${n}`).join(", ")})`
    : "";
  const maybe = (n: number | null) => (n === null ? "n/a" : String(n));
  const icon = pipelineHealthIsClean(c) ? ":large_green_circle:" : ":red_circle:";
  return [
    `${icon} Pipeline ${windowHours}h: stuck ${c.pending_stuck}`,
    `failed ${failedTotal}${failedDetail}`,
    `WhatsApp events failed ${c.whatsapp_events_failed}`,
    `cron failed ${maybe(c.cron_failed)}`,
    `HTTP errors ${maybe(c.http_errors)}`,
    `SMS sent ${c.sms_sent}`,
  ].join(" · ");
}
