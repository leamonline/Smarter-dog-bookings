import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";

/**
 * Customer authentication via phone OTP.
 * Flow: enter phone → requestOtp() → enter code → verifyOtp()
 * After auth, we look up the humans table by phone to find their record.
 */
export function useCustomerAuth() {
  const [user, setUser] = useState(null);
  const [humanRecord, setHumanRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [phone, setPhone] = useState("");

  // Look up the human record by phone number
  const fetchHumanByPhone = useCallback(async (phoneNum) => {
    if (!supabase || !phoneNum) return null;
    // Normalise: strip spaces, ensure +44 prefix for UK numbers
    const normalised = phoneNum.replace(/\s+/g, "");

    const { data, error: err } = await supabase
      .from("humans")
      .select("*")
      .or(`phone.eq.${normalised},phone.eq.${normalised.replace("+44", "0")}`)
      .limit(1)
      .single();

    if (err) {
      console.warn("No human record found for phone:", normalised, err.message);
      return null;
    }
    return data;
  }, []);
  // On mount, check if already authenticated
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    let cancelled = false;
    let initialDone = false;

    const timeout = setTimeout(() => {
      if (!initialDone && !cancelled) {
        initialDone = true;
        setLoading(false);
      }
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (cancelled) return;
        try {
          if (session?.user) {
            setUser(session.user);
            // Look up human record by the phone used to sign in
            const ph = session.user.phone;
            if (ph) {
              const human = await fetchHumanByPhone(ph);
              if (!cancelled) setHumanRecord(human);
            }
          } else {
            setUser(null);
            setHumanRecord(null);
          }
        } catch (err) {
          console.error("useCustomerAuth: error in auth callback:", err);
        } finally {
          if (!initialDone && !cancelled) {
            initialDone = true;
            setLoading(false);
          }
        }
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);
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
  const verifyOtp = useCallback(async (code) => {
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
  }, [phone]);
  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setHumanRecord(null);
    setOtpSent(false);
    setPhone("");
  }, []);

  // Reset to go back to phone entry
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
