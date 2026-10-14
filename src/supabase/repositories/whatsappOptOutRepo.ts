/**
 * whatsappOptOutRepo — reading a number's WhatsApp opt-out scope, and
 * switching WhatsApp back on for it with the customer's renewed permission.
 *
 * The scope read is narrowed field by field; an unexpected shape is an
 * error, never a partial scope. The re-enable takes the scope OBJECT, not
 * ids and a time: it sends exactly the records the scope listed and the
 * latest STOP as the server's own string, so no caller can send a subset or
 * a reformatted timestamp. Neither function logs or throws: every outcome,
 * a transport failure included, comes back as { value, error }.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NumberOptOutScope, OptOutRecord } from "../../engine/whatsappReenable";
import { isScopeEmpty } from "../../engine/whatsappReenable";
import { getWhatsappNumberOptOutScope, reenableWhatsappNumber } from "../rpc";
import { isNonEmptyString, isRecord, isUuid } from "./bookingPolicyProjectionGuards";

export type { NumberOptOutScope, OptOutRecord };

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
