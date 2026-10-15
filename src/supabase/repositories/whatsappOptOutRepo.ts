/**
 * whatsappOptOutRepo — reading a number's WhatsApp opt-out scope, switching
 * WhatsApp back on for it with the customer's renewed permission, and
 * reading what settles what happened to a scope: the audit of re-enables,
 * and each record's opt-out as it is now.
 *
 * Every read is narrowed field by field; an unexpected shape is an error,
 * never a partial scope or a partial audit. The re-enable takes the scope
 * OBJECT, not ids and a time: it sends exactly the records the scope listed
 * and the latest STOP as the server's own string, so no caller can send a
 * subset or a reformatted timestamp. No function here logs or throws: every
 * outcome, a transport failure included, comes back as { value, error }.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRow, NumberOptOutScope, OptOutRecord } from "../../engine/whatsappReenable";
import { isScopeEmpty, isStrictlyLater } from "../../engine/whatsappReenable";
import { getWhatsappNumberOptOutScope, reenableWhatsappNumber } from "../rpc";
import { isNonEmptyString, isRecord, isUuid } from "./bookingPolicyProjectionGuards";

export type { AuditRow, NumberOptOutScope, OptOutRecord };

/** The audit table the re-enable function writes, one row per re-enable (and nothing else writes it). */
const REENABLE_AUDIT_TABLE = "whatsapp_opt_out_reenables";
const REENABLE_AUDIT_COLUMNS = "id, human_ids, conversation_ids, permission_note, reenabled_by, reenabled_at";
/** More re-enables than this for one number (or its records) since staff looked is not credible. */
const REENABLE_AUDIT_LIMIT = 50;
const HUMANS_TABLE = "humans";
const OPT_OUT_STATE_COLUMNS = "id, whatsapp_opted_out";

export interface ReenableResult {
  phoneKey: string;
  humanIds: string[];
  conversationIds: string[];
  auditId: string;
}

export interface RepoError {
  /** SQLSTATE or PostgREST code; "" when the request never got an answer. */
  code: string;
  message: string;
  details: string | null;
  /** The request threw before any response: its outcome is unknown. */
  thrown: boolean;
}

export type RepoResult<T> = { value: T; error: null } | { value: null; error: RepoError };

function rpcError(error: unknown): RepoError {
  const source = isRecord(error) ? error : {};
  return {
    code: typeof source.code === "string" ? source.code : "",
    message: isNonEmptyString(source.message) ? source.message : "The request failed.",
    details: typeof source.details === "string" ? source.details : null,
    thrown: false,
  };
}

function thrownError(cause: unknown): RepoError {
  return {
    code: "",
    message: cause instanceof Error && cause.message ? cause.message : "The request failed.",
    details: null,
    thrown: true,
  };
}

function invalidResponse(code: string): RepoError {
  return {
    code,
    message: "The response could not be verified.",
    details: null,
    thrown: false,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function toRecord(value: unknown): OptOutRecord | null {
  if (!isRecord(value)) return null;
  const { id, name, phone, reason, opted_out_at: optedOutAt } = value;
  // concat_ws gives "" for a record with no name, so "" is a valid name.
  if (!isUuid(id) || typeof name !== "string") return null;
  if (!isNullableString(phone) || !isNullableString(reason) || !isNullableString(optedOutAt)) {
    return null;
  }
  return { id, name, phone, reason, optedOutAt };
}

function toScope(phone: string, data: unknown): NumberOptOutScope | null {
  if (!isRecord(data) || !isNonEmptyString(data.phone_key)) return null;
  const { number_stopped_at: numberStoppedAt, last_stop_at: lastStopAt, records } = data;
  if (!isNullableString(numberStoppedAt) || !isNullableString(lastStopAt)) return null;
  if (!Array.isArray(records)) return null;
  const parsed = records.map(toRecord);
  if (parsed.some((record) => record === null)) return null;
  return {
    phone,
    phoneKey: data.phone_key,
    numberStoppedAt,
    lastStopAt,
    records: parsed as OptOutRecord[],
  };
}

function isUuidArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isUuid);
}

function toReenableResult(data: unknown): ReenableResult | null {
  if (!isRecord(data) || !isNonEmptyString(data.phone_key) || !isUuid(data.audit_id)) return null;
  if (!isUuidArray(data.human_ids) || !isUuidArray(data.conversation_ids)) return null;
  return {
    phoneKey: data.phone_key,
    humanIds: data.human_ids,
    conversationIds: data.conversation_ids,
    auditId: data.audit_id,
  };
}

/** Everything switching WhatsApp back on for `phone` would cover. */
export async function getNumberOptOutScope(
  client: SupabaseClient,
  phone: string,
): Promise<RepoResult<NumberOptOutScope>> {
  try {
    const { data, error } = await getWhatsappNumberOptOutScope(client, { phone });
    if (error) return { value: null, error: rpcError(error) };
    const scope = toScope(phone, data);
    if (!scope) return { value: null, error: invalidResponse("INVALID_OPT_OUT_SCOPE") };
    return { value: scope, error: null };
  } catch (cause) {
    return { value: null, error: thrownError(cause) };
  }
}

/**
 * Switch WhatsApp back on for exactly what `scope` lists. An empty scope is
 * refused here, without a request: there is nothing to switch back on.
 */
export async function reenableNumber(
  client: SupabaseClient,
  scope: NumberOptOutScope,
  permissionNote: string,
): Promise<RepoResult<ReenableResult>> {
  if (isScopeEmpty(scope)) {
    return {
      value: null,
      error: {
        code: "P0001",
        message: "WhatsApp is not switched off for this number.",
        details: "nothing_to_reenable",
        thrown: false,
      },
    };
  }
  try {
    const { data, error } = await reenableWhatsappNumber(client, {
      phone: scope.phone,
      humanIds: scope.records.map((record) => record.id),
      lastStopAt: scope.lastStopAt,
      permissionNote: permissionNote.trim(),
    });
    if (error) return { value: null, error: rpcError(error) };
    const result = toReenableResult(data);
    // The call returned without an error, so it may well have committed: an
    // unreadable answer is an unknown outcome (code ""), never a failure.
    if (!result) return { value: null, error: invalidResponse("") };
    return { value: result, error: null };
  } catch (cause) {
    return { value: null, error: thrownError(cause) };
  }
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function toAuditRow(value: unknown): AuditRow | null {
  if (!isRecord(value)) return null;
  const {
    id,
    human_ids: humanIds,
    conversation_ids: conversationIds,
    permission_note: permissionNote,
    reenabled_by: reenabledBy,
    reenabled_at: reenabledAt,
  } = value;
  if (!isUuid(id) || !isUuid(reenabledBy) || typeof permissionNote !== "string") return null;
  if (!isUuidArray(humanIds) || !isUuidArray(conversationIds) || !isTimestamp(reenabledAt)) return null;
  return { id, humanIds, conversationIds, permissionNote, reenabledBy, reenabledAt };
}

/**
 * The re-enables recorded for a number, newest first: the only proof that a
 * record which left the scope was switched back on (a record also leaves it
 * when its phone changes, and stays opted out). `phoneKey` is the scope's
 * own, computed by the server; never one worked out here. With `humanIds`,
 * also every re-enable that listed any of those records, whatever number it
 * was for: a record whose phone changed can be switched back on under its
 * new number. With `sinceIso`, only rows strictly after it. Each row once.
 */
export async function listNumberReenables(
  client: SupabaseClient,
  phoneKey: string,
  sinceIso: string | null,
  humanIds: readonly string[] = [],
): Promise<RepoResult<AuditRow[]>> {
  try {
    let byNumber = client.from(REENABLE_AUDIT_TABLE).select(REENABLE_AUDIT_COLUMNS).eq("phone_key", phoneKey);
    if (sinceIso !== null) byNumber = byNumber.gt("reenabled_at", sinceIso);
    const reads = [byNumber.order("reenabled_at", { ascending: false }).limit(REENABLE_AUDIT_LIMIT)];
    if (humanIds.length > 0) {
      let byRecord = client
        .from(REENABLE_AUDIT_TABLE)
        .select(REENABLE_AUDIT_COLUMNS)
        .overlaps("human_ids", [...humanIds]);
      if (sinceIso !== null) byRecord = byRecord.gt("reenabled_at", sinceIso);
      reads.push(byRecord.order("reenabled_at", { ascending: false }).limit(REENABLE_AUDIT_LIMIT));
    }
    const answers = await Promise.all(reads);
    const byId = new Map<string, AuditRow>();
    for (const { data, error } of answers) {
      if (error) return { value: null, error: rpcError(error) };
      if (!Array.isArray(data)) return { value: null, error: invalidResponse("INVALID_REENABLE_AUDIT") };
      for (const value of data) {
        const row = toAuditRow(value);
        if (!row) return { value: null, error: invalidResponse("INVALID_REENABLE_AUDIT") };
        byId.set(row.id, row);
      }
    }
    const rows = [...byId.values()].sort((a, b) =>
      isStrictlyLater(a.reenabledAt, b.reenabledAt) ? -1 : isStrictlyLater(b.reenabledAt, a.reenabledAt) ? 1 : 0,
    );
    return { value: rows, error: null };
  } catch (cause) {
    return { value: null, error: thrownError(cause) };
  }
}

/**
 * Whether each record is switched off for WhatsApp now, wherever its number
 * is: true when it is. An audit row shows a re-enable that happened; the
 * record can have been switched off again since. A record the read does not
 * return (deleted, or not visible) is left out. No records, no request.
 */
export async function getWhatsappOptOutNow(
  client: SupabaseClient,
  humanIds: readonly string[],
): Promise<RepoResult<Record<string, boolean>>> {
  if (humanIds.length === 0) return { value: {}, error: null };
  try {
    const { data, error } = await client.from(HUMANS_TABLE).select(OPT_OUT_STATE_COLUMNS).in("id", [...humanIds]);
    if (error) return { value: null, error: rpcError(error) };
    if (!Array.isArray(data)) return { value: null, error: invalidResponse("INVALID_OPT_OUT_STATE") };
    const asked = new Set(humanIds);
    const state: Record<string, boolean> = {};
    for (const row of data as unknown[]) {
      if (!isRecord(row) || !isUuid(row.id) || !asked.has(row.id) || typeof row.whatsapp_opted_out !== "boolean") {
        return { value: null, error: invalidResponse("INVALID_OPT_OUT_STATE") };
      }
      state[row.id] = row.whatsapp_opted_out;
    }
    return { value: state, error: null };
  } catch (cause) {
    return { value: null, error: thrownError(cause) };
  }
}

/** The signed-in member of staff, as the audit records them (auth.uid()). */
export async function getSignedInUserId(client: SupabaseClient): Promise<RepoResult<string>> {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return { value: null, error: rpcError(error) };
    const id: unknown = data?.session?.user?.id;
    if (!isUuid(id)) return { value: null, error: invalidResponse("NO_SIGNED_IN_USER") };
    return { value: id, error: null };
  } catch (cause) {
    return { value: null, error: thrownError(cause) };
  }
}
