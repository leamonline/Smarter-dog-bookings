import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../customerClient.js";

/**
 * Customer authentication via phone OTP.
 * Uses a SEPARATE Supabase client (customerClient.js) with its own
 * storage key so staff and customer sessions don't conflict.
 *
 * Flow: enter phone → requestOtp() → enter code → verifyOtp()
 *
 * After a successful OTP verification, we call the database-side RPC
 * `link_customer_to_human(p_phone)` instead of querying the humans
 * table directly.  The RPC:
 *   • runs as SECURITY DEFINER (bypasses RLS for the lookup)
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
   * is atomic and cannot be replicated from the client.
   */
  const linkHumanRecord = useCallback(async (phoneNum) => {
    if (!supabase || !phoneNum) return null;

    // Normalise before sending to the RPC (RPC also normalises, but
    // sending a clean value avoids edge-case whitespace issues).
    const normalised = phoneNum.replace(/\s+/g, "");

    const { data, error: rpcErr } = await supabase.rpc(
      "link_customer_to_human",
      { p_phone: normalised },
    );

    if (rpcErr) {
      console.error("link_customer_to_human RPC error:", rpcErr);
      return null;
    }

    // The RPC returns SETOF humans — Supabase surfaces this as an array.
    if (!data || data.length === 0) {
      console.warn(
        "No human record found or already claimed for phone:",
        normalised,
      );
      return null;
    }

    return data[0];
  }, []);

  // On mount: restore any existing session
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let initialDone = false;

    const finish = () => {
      if (!initialDone && !cancelled) {
        initialDone = true;
        setLoading(false);
      }
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
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      try {
        if (session?.user) {
          setUser(session.user);

          const ph = session.user.phone;
          if (ph) {
            const human = await linkHumanRecord(ph);
            if (!cancelled) setHumanRecord(human);
          }
        } else {
          setUser(null);
          setHumanRecord(null);
        }
      } catch (err) {
        console.error("useCustomerAuth: unexpected error:", err);
      } finally {
        finish();
      }
    });

    return () => {
      cancelled = true;
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
    setError(null);
    setPhone(phoneNumber);

    const { error: err } = await supabase.auth.signInWithOtp({
      phone: phoneNumber,
    });

    if (err) {
      setError(err.message);
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
        setError(err.message);
        return { error: err };
      }

      return { data };
    },
    [phone],
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
