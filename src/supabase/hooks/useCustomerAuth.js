import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../customerClient.js";
import { normaliseUkMobile } from "../../utils/phone.js";

const OTP_SEND_ERROR =
  "Could not send your login code. Please check your number and try again.";
const OTP_VERIFY_ERROR =
  "That code did not work. Please check it and try again.";
const PHONE_FORMAT_ERROR =
  "Please enter a valid UK mobile number, for example 07700 900123.";

/**
 * Customer authentication via phone OTP.
 * Uses a SEPARATE Supabase client (customerClient.js) with its own
 * storage key so staff and customer sessions don't conflict.
 *
 * Flow: enter phone → requestOtp() → enter code → verifyOtp()
 *
 * After a successful OTP verification, we call the database-side RPC
 * `link_customer_to_human()` (no args) instead of querying the humans
 * table directly.  The RPC:
 *   • runs as SECURITY DEFINER (bypasses RLS for the lookup)
 *   • derives the lookup phone from auth.users.phone for the calling
 *     auth.uid() — never trusts caller-supplied input (issue #92)
 *   • finds the human row by phone number (normalises +44 ↔ 07)
 *   • sets humans.customer_user_id = auth.uid() on first login
 *   • returns empty if the number is unclaimed by any salon record,
 *     OR if the record is already claimed by a different auth user
 *
 * This means customer identity is bound to auth.uid() (a stable UUID)
 * rather than a mutable, non-unique phone string.
 */
export function useCustomerAuth() {
  const [user, setUser] = useState(null);
  const [humanRecord, setHumanRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [phone, setPhone] = useState("");

  /**
   * Look up — and permanently link — the human record for the
   * authenticated user.  Uses the server-side RPC so the binding
   * is atomic and cannot be replicated from the client. The RPC
   * derives the lookup phone from auth.users.phone for the calling
   * auth.uid(); it takes no arguments.
   */
  const linkHumanRecord = useCallback(async () => {
    if (!supabase) return null;

    const { data, error: rpcErr } = await supabase.rpc("link_customer_to_human");

    if (rpcErr) {
      console.error("link_customer_to_human RPC error:", rpcErr);
      return null;
    }

    // The RPC returns customer-safe human fields — Supabase surfaces this as an array.
    if (!data || data.length === 0) {
      console.warn("No human record found or already claimed for current user");
      return null;
    }

    return data[0];
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let initialDone = false;
    let sessionRun = 0;

    const finish = () => {
      if (!initialDone && !cancelled) {
        initialDone = true;
        setLoading(false);
      }
    };

    const applySession = (session) => {
      if (cancelled) return;

      const run = ++sessionRun;

      if (!session?.user) {
        setUser(null);
        setHumanRecord(null);
        finish();
        setLoading(false);
        return;
      }

      setUser(session.user);
      setLoading(true);

      if (!session.user.phone) {
        setHumanRecord(null);
        finish();
        setLoading(false);
        return;
      }

      setTimeout(async () => {
        try {
          const human = await linkHumanRecord();
          if (!cancelled && run === sessionRun) setHumanRecord(human);
        } catch (err) {
          console.error("useCustomerAuth: error linking human record:", err);
        } finally {
          if (!cancelled && run === sessionRun) {
            finish();
            setLoading(false);
          }
        }
      }, 0);
    };

    // Safety net: never block the UI indefinitely
    const timeout = setTimeout(() => {
      if (!initialDone && !cancelled) {
        console.warn("useCustomerAuth: auth startup timed out after 5s");
        finish();
      }
    }, 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase holds the auth lock while firing subscribers, so any RPC
      // lookup is deferred inside applySession rather than awaited here.
      applySession(session);
    });

    supabase.auth
      .getSession()
      .then(({ data, error: sessionErr }) => {
        if (sessionErr) {
          console.error("useCustomerAuth: failed to get initial session:", sessionErr);
          finish();
          return;
        }
        applySession(data?.session ?? null);
      })
      .catch((err) => {
        console.error("useCustomerAuth: unexpected getSession error:", err);
        finish();
      });

    return () => {
      cancelled = true;
      sessionRun += 1;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [linkHumanRecord]);

  // Request OTP — sends SMS to the phone number
  const requestOtp = useCallback(async (phoneNumber) => {
    if (!supabase) {
      setError("Not connected.");
      return { error: { message: "Offline" } };
    }
    const normalisedPhone = normaliseUkMobile(phoneNumber);
    if (!normalisedPhone) {
      setError(PHONE_FORMAT_ERROR);
      return { error: { message: "Invalid phone number" } };
    }
    setError(null);
    setPhone(normalisedPhone);

    const { error: err } = await supabase.auth.signInWithOtp({
      phone: normalisedPhone,
    });

    if (err) {
      console.error("Customer OTP send failed:", err);
      setError(OTP_SEND_ERROR);
      return { error: err };
    }

    setOtpSent(true);
    return { success: true };
  }, []);

  // Verify the OTP code
  const verifyOtp = useCallback(
    async (code) => {
      if (!supabase) {
        setError("Not connected.");
        return { error: { message: "Offline" } };
      }
      setError(null);

      const { data, error: err } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: "sms",
      });

      if (err) {
        console.error("Customer OTP verification failed:", err);
        setError(OTP_VERIFY_ERROR);
        return { error: err };
      }

      if (data?.user?.phone) {
        setLoading(true);
        try {
          const human = await linkHumanRecord();
          setUser(data.user);
          setHumanRecord(human);
        } finally {
          setLoading(false);
        }
      }

      return { data };
    },
    [linkHumanRecord, phone],
  );

  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setHumanRecord(null);
    setOtpSent(false);
    setPhone("");
  }, []);

  // Reset to phone-entry step
  const resetOtp = useCallback(() => {
    setOtpSent(false);
    setPhone("");
    setError(null);
  }, []);

  return {
    user,
    humanRecord,
    loading,
    error,
    otpSent,
    phone,
    requestOtp,
    verifyOtp,
    signOut,
    resetOtp,
  };
}
