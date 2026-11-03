// ============================================================
// src/engine/smsPermission.ts
//
// Pure rules for the staff "texts are fine" confirmation after a WhatsApp STOP
// (docs/messaging-policy.md). No React, no network.
//
// A customer whose WhatsApp is stopped has automatic texts PAUSED until staff
// clarify which channels they allow. `preferred_channel = 'sms'` is the proof,
// and it can only be set by the audited confirm action (migration
// 20261104100000). This module decides what the customer card should say, checks
// the reason staff type, and turns the database's refusals into plain words.
// ============================================================

import { smsPausedAfterStop } from "../../supabase/functions/_shared/channelPolicy";

/** The database refuses anything shorter (staff_confirm_sms_permission). */
export const SMS_REASON_MIN_LENGTH = 10;

export type SmsPermissionState =
  /** Texts are not paused for this customer: nothing to show. */
  | "not_applicable"
  /** They stopped WhatsApp and staff have not yet said texts are fine. */
  | "paused"
  /** They stopped WhatsApp and staff recorded that texts are fine. */
  | "confirmed"
  /** They asked us to stop texting. Cannot be confirmed away. */
  | "opted_out";

export interface SmsPermissionHuman {
  whatsappOptedOut?: boolean | null;
  smsOptedOut?: boolean | null;
  preferredChannel?: string | null;
}

export function smsPermissionState(human: SmsPermissionHuman | null | undefined): SmsPermissionState {
  if (!human) return "not_applicable";
  if (human.smsOptedOut) return "opted_out";
  if (!human.whatsappOptedOut) return "not_applicable";
  const paused = smsPausedAfterStop({
    whatsapp_opted_out: human.whatsappOptedOut,
    preferred_channel: human.preferredChannel ?? null,
  });
  return paused ? "paused" : "confirmed";
}

export type ReasonCheck = { ok: true; reason: string } | { ok: false; error: string };

/** What staff typed, trimmed, or what is wrong with it. Mirrors the server's own check. */
export function checkReason(input: string | null | undefined, kind: "confirm" | "withdraw"): ReasonCheck {
  const reason = (input ?? "").trim();
  if (reason.length < SMS_REASON_MIN_LENGTH) {
    return {
      ok: false,
      error:
        kind === "confirm"
          ? `Say how they told you texts are fine (at least ${SMS_REASON_MIN_LENGTH} characters).`
          : `Say why texts are being paused again (at least ${SMS_REASON_MIN_LENGTH} characters).`,
    };
  }
  return { ok: true, reason };
}

/** The database's refusals (their `detail` codes), in words staff can act on. */
export function smsPermissionErrorMessage(error: { code?: string; details?: string | null; message?: string } | null | undefined): string {
  const detail = error?.details ?? "";
  if (error?.code === "42501") return "Only staff can do this.";
  if (detail.includes("reason_required")) return "Add a reason first.";
  if (detail.includes("sms_opted_out")) return "They've opted out of texts, so this can't be confirmed here.";
  if (detail.includes("nothing_to_confirm")) return "Texts aren't paused for this customer.";
  if (detail.includes("already_confirmed")) return "Texts are already confirmed for this customer.";
  if (detail.includes("nothing_to_withdraw")) return "There's no confirmation to withdraw.";
  if (detail.includes("no_phone")) return "This customer has no mobile number to text. Add one first.";
  if (detail.includes("unknown_customer")) return "That customer couldn't be found.";
  return "That didn't save. Nothing was changed. Please try again.";
}

export interface SmsPermissionRow {
  id: string;
  action: "confirmed" | "withdrawn" | "superseded_by_stop";
  reason: string;
  confirmedBy: string | null;
  confirmedByName: string | null;
  createdAt: string;
}

const ACTIONS = new Set(["confirmed", "withdrawn", "superseded_by_stop"]);

/** Narrow raw audit rows; an unexpected shape is dropped, never half-shown. */
export function parseSmsPermissionRows(data: unknown): SmsPermissionRow[] {
  if (!Array.isArray(data)) return [];
  const rows: SmsPermissionRow[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.action !== "string" || !ACTIONS.has(r.action)) continue;
    if (typeof r.reason !== "string" || typeof r.created_at !== "string") continue;
    rows.push({
      id: r.id,
      action: r.action as SmsPermissionRow["action"],
      reason: r.reason,
      confirmedBy: typeof r.confirmed_by === "string" ? r.confirmed_by : null,
      confirmedByName: typeof r.confirmed_by_name === "string" && r.confirmed_by_name.trim() ? r.confirmed_by_name : null,
      createdAt: r.created_at,
    });
  }
  return rows;
}

const ACTION_LABEL: Record<SmsPermissionRow["action"], string> = {
  confirmed: "Texts confirmed",
  withdrawn: "Confirmation withdrawn",
  superseded_by_stop: "Cleared by a new STOP",
};

/** One line of history: what happened, who did it, and why. */
export function describeSmsPermissionRow(row: SmsPermissionRow): { label: string; by: string; reason: string } {
  return {
    label: ACTION_LABEL[row.action],
    by: row.action === "superseded_by_stop" ? "the system" : row.confirmedByName ?? "a member of staff",
    reason: row.reason,
  };
}

/** The most recent row that is still in force: a confirmation not since withdrawn or cleared. */
export function currentConfirmation(rowsNewestFirst: readonly SmsPermissionRow[]): SmsPermissionRow | null {
  const newest = rowsNewestFirst[0];
  return newest?.action === "confirmed" ? newest : null;
}
