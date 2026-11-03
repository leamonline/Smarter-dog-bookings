/**
 * smsPermissionRepo: staff confirming (or withdrawing) that a customer is happy
 * to be texted after a WhatsApp STOP, and reading the audit of those decisions.
 *
 * The two writes are RPCs (migration 20261104100000) that record who, when and
 * why in the same transaction; nothing here writes the proof directly. Every
 * outcome, a transport failure included, comes back as a result, never a throw.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmSmsPermission, withdrawSmsPermission } from "../rpc";
import { parseSmsPermissionRows, type SmsPermissionRow } from "../../engine/smsPermission";

const AUDIT_TABLE = "sms_permission_confirmations";
const AUDIT_COLUMNS = "id, action, reason, confirmed_by, confirmed_by_name, created_at";
/** Enough to show what happened without paging; the table keeps the rest. */
const HISTORY_LIMIT = 20;

export interface SmsPermissionError {
  code: string;
  message: string;
  details: string | null;
}

export type SmsPermissionResult =
  | { ok: true; auditId: string | null }
  | { ok: false; error: SmsPermissionError };

function toError(error: unknown): SmsPermissionError {
  const e = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  return {
    code: typeof e.code === "string" ? e.code : "",
    message: typeof e.message === "string" && e.message ? e.message : "The request failed.",
    details: typeof e.details === "string" ? e.details : null,
  };
}

function auditIdOf(data: unknown): string | null {
  const id = data && typeof data === "object" ? (data as Record<string, unknown>).audit_id : null;
  return typeof id === "string" ? id : null;
}

async function run(
  call: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<SmsPermissionResult> {
  try {
    const { data, error } = await call();
    if (error) return { ok: false, error: toError(error) };
    return { ok: true, auditId: auditIdOf(data) };
  } catch (cause) {
    return { ok: false, error: toError(cause) };
  }
}

export function confirmSms(client: SupabaseClient, humanId: string, reason: string) {
  return run(() => confirmSmsPermission(client, { humanId, reason }));
}

export function withdrawSms(client: SupabaseClient, humanId: string, reason: string) {
  return run(() => withdrawSmsPermission(client, { humanId, reason }));
}

/** Newest first. An unreadable answer is an error, not an empty history. */
export async function listSmsPermissionHistory(
  client: SupabaseClient,
  humanId: string,
): Promise<{ ok: true; rows: SmsPermissionRow[] } | { ok: false; error: SmsPermissionError }> {
  try {
    const { data, error } = await client
      .from(AUDIT_TABLE)
      .select(AUDIT_COLUMNS)
      .eq("human_id", humanId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) return { ok: false, error: toError(error) };
    return { ok: true, rows: parseSmsPermissionRows(data) };
  } catch (cause) {
    return { ok: false, error: toError(cause) };
  }
}
