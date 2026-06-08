import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../customerClient.js";
import { linkCustomerToHuman } from "../rpc";
import { normaliseUkMobile } from "../../utils/phone.js";

const OTP_SEND_ERROR =
  "Could not send your login code. Please check your number and try again.";
const OTP_VERIFY_ERROR =
  "That code did not work. Please check it and try again.";
const PHONE_FORMAT_ERROR =
  "Please enter a valid UK mobile number, for example 07700 900123.";
const PHONE_NOT_ON_FILE_ERROR =
  "We don't have that number on file. Please contact the salon to register before logging in.";
const PHONE_RATE_LIMITED_ERROR =
  "Too many attempts. Please wait a minute and try again.";

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

    const { data, error: rpcErr } = await linkCustomerToHuman(supabase);

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

  // Request OTP — sends SMS to the phone number.
  // Pre-flight: ask the salon's database (via a rate-limited Edge
  // Function) whether the phone is on file before calling
  // signInWithOtp. Twilio charges per SMS, so we don't want to spend
  // money texting numbers that aren't ours, and a legit customer who
  // mis-types their number gets a clearer error.
  // captchaToken comes from the Cloudflare Turnstile widget and is
  // attached to the OTP request so Supabase's bot-protection passes.
  const requestOtp = useCallback(async (phoneNumber, captchaToken) => {
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

    // Pre-auth lookup via the customer-phone-on-file Edge Function.
    // The function applies per-IP rate limiting (5 attempts / 60s)
    // and then delegates to the SECURITY DEFINER RPC. Going through
    // the function rather than calling the RPC directly is what lets
    // us enforce the rate cap — the raw RPC is not granted to anon.
    const { data: lookupData, error: lookupErr } = await supabase.functions
      .invoke("customer-phone-on-file", {
        body: { phone: normalisedPhone },
      });

    if (lookupErr) {
      // Supabase wraps non-2xx responses in FunctionsHttpError. Pull
      // the JSON body off so we can show a tailored message for the
      // rate-limit case instead of a generic "failed to send".
      let errPayload = null;
      try {
        errPayload = await lookupErr.context?.json?.();
      } catch {
        // ignore — fall through to status check below
      }
      if (errPayload?.error === "rate_limited") {
        setError(PHONE_RATE_LIMITED_ERROR);
        return { error: { message: "Rate limited" } };
      }
      // Common deployment slip: the Edge Function is not deployed yet
      // (Supabase returns 404 / FunctionsRelayError). Surface that
      // clearly so the operator can fix it rather than chasing a
      // generic "could not send".
      const status = lookupErr.context?.status;
      const name = lookupErr.name || "";
      const looksLikeMissingFn =
        status === 404 ||
        name === "FunctionsRelayError" ||
        name === "FunctionsFetchError";
      if (looksLikeMissingFn) {
        console.error(
          "customer-phone-on-file Edge Function not reachable. Did you run `supabase functions deploy customer-phone-on-file`?",
          lookupErr,
          errPayload,
        );
        setError(
          "Login service isn't available right now. Please contact the salon.",
        );
        return { error: lookupErr };
      }
      console.error("customer-phone-on-file function error:", lookupErr, errPayload);
      setError(OTP_SEND_ERROR);
      return { error: lookupErr };
    }

    if (!lookupData?.on_file) {
      setError(PHONE_NOT_ON_FILE_ERROR);
      return { error: { message: "Phone not on file" } };
    }

    const otpOptions = captchaToken ? { options: { captchaToken } } : {};
    const { error: err } = await supabase.auth.signInWithOtp({
      phone: normalisedPhone,
      ...otpOptions,
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

  // Re-fetch the linked human record (e.g. after the onboarding gate saves
  // a new name/address) so the rest of the app sees the fresh values without
  // a full reload. Re-runs the same SECURITY DEFINER link RPC, which returns
  // the current humans row for the already-linked account.
  const refreshHumanRecord = useCallback(async () => {
    const human = await linkHumanRecord();
    setHumanRecord(human);
    return human;
  }, [linkHumanRecord]);

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
    refreshHumanRecord,
  };
}
