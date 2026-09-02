// Data hook for the staff auth pages (Debt #12): binds the staff Supabase
// client to the four supabase.auth calls LoginPage and ResetPasswordPage
// used to make with the client directly. Pure pass-throughs — every result
// is returned exactly as supabase-js hands it back, so the pages keep their
// own error copy, timeouts and recovery-event handling.
import { supabase } from "../client";

type Client = NonNullable<typeof supabase>;
type StaffAuth = Client["auth"];

function requireClient(): Client {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

const authActions = {
  /** False in sample-data mode or before credentials exist; the actions throw. */
  get connected(): boolean {
    return Boolean(supabase);
  },
  /** Sends the password-reset email; `redirectTo` is where the recovery link lands. */
  requestPasswordReset(email: string, options?: Parameters<StaffAuth["resetPasswordForEmail"]>[1]) {
    return requireClient().auth.resetPasswordForEmail(email, options);
  },
  /** Sets a new password on the session established by the recovery link. */
  updatePassword(password: string) {
    return requireClient().auth.updateUser({ password });
  },
  onAuthStateChange(callback: Parameters<StaffAuth["onAuthStateChange"]>[0]) {
    return requireClient().auth.onAuthStateChange(callback);
  },
  getSession() {
    return requireClient().auth.getSession();
  },
};

export type StaffAuthActions = typeof authActions;

/** The client is a module constant, so this is a stable singleton. */
export function useStaffAuthActions(): StaffAuthActions {
  return authActions;
}
