// Action hook for the staff SMS-permission confirmation (migration
// 20261104100000): binds the staff Supabase client to the audited confirm /
// withdraw actions and the history read, so the customer card never imports the
// client itself (the pattern of useStaffContacts / useStaffMessaging).
import { supabase } from "../client";
import { confirmSms, listSmsPermissionHistory, withdrawSms } from "../repositories/smsPermissionRepo";

const NOT_CONNECTED = {
  ok: false as const,
  error: { code: "", message: "Not connected", details: null },
};

const smsPermission = {
  /** False in sample-data mode or before credentials exist; the actions then refuse. */
  get connected(): boolean {
    return Boolean(supabase);
  },
  confirm: (humanId: string, reason: string) =>
    supabase ? confirmSms(supabase, humanId, reason) : Promise.resolve(NOT_CONNECTED),
  withdraw: (humanId: string, reason: string) =>
    supabase ? withdrawSms(supabase, humanId, reason) : Promise.resolve(NOT_CONNECTED),
  history: (humanId: string) =>
    supabase ? listSmsPermissionHistory(supabase, humanId) : Promise.resolve(NOT_CONNECTED),
};

export type SmsPermissionActions = typeof smsPermission;

/** The client is a module constant, so this is a stable singleton. */
export function useSmsPermission(): SmsPermissionActions {
  return smsPermission;
}
