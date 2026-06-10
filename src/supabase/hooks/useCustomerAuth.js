import { useState, useEffect, useCallback, useRef } from "react";
import { customerSupabase as supabase } from "../customerClient.js";
import { linkCustomerToHuman, createPendingCustomer } from "../rpc";
import { normaliseUkMobile } from "../../utils/phone.js";
import { logger } from "../../lib/logger.js";

const OTP_SEND_ERROR =
  "Could not send your login code. Please check your number and try again.";
const OTP_VERIFY_ERROR =
  "That code did not work. Please check it and try again.";
const PHONE_FORMAT_ERROR =
  "Please enter a valid UK mobile number, for example 07700 900123.";
const PHONE_RATE_LIMITED_ERROR =
  "Too many attempts. Please wait a minute and try again.";
// Deliberately generic so it never reveals whether a number has a password
// set (or even exists). Always offers the code fallback as the way through.
const PASSWORD_LOGIN_ERROR =
  "That number and password don't match. Try again, or get a code by text.";

/**
 * Customer authentication: phone + password, with SMS OTP as the
 * first-login / forgot-password path.
 *
 * Uses a SEPARATE Supabase client (customerClient.js) with its own
 * storage key so staff and customer sessions don't conflict.
 *
 * The login page is phone-first:
 *   1. checkPhone(phone)            → { on_file, has_password } (NO SMS)
 *   2a. has_password               → signInWithPassword(password)
 *   2b. on_file && !has_password   → sendOtp() → verifyOtp(code)  (first login)
 *   2c. "forgot password"          → sendOtp() → verifyOtp(code, { isReset })
 *
 * After any successful sign-in (password or OTP), the SIGNED_IN event
 * runs link_customer_to_human() via applySession(), which:
 *   • runs as SECURITY DEFINER (bypasses RLS for the lookup)
 *   • derives the lookup phone from auth.users.phone for the calling
 *     auth.uid() — never trusts caller-supplied input (issue #92)
 *   • finds the human row by phone number (normalises +44 ↔ 07)
 *   • sets humans.customer_user_id = auth.uid() on first login
 *   • returns customer-safe fields PLUS has_password, derived live from
 *     auth.users.encrypted_password
 *
 * `hasPassword` (read off the linked record) and the transient
 * `mustSetPassword` flag (set after a forgot-password OTP verify) drive
 * the required set-password gate in CustomerApp.
 */
export function useCustomerAuth() {
  const [user, setUser] = useState(null);
  const [humanRecord, setHumanRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [phone, setPhone] = useState("");
  // Authoritative copy of the normalised phone. checkPhone sets this
  // synchronously so a follow-up sendOtp/signInWithPassword in the SAME
  // tick (the first-login path sends an OTP immediately after the check)
  // reads the right number — the `phone` state setter is async and would
  // still be empty here. `phone` state stays for display only.
  const phoneRef = useRef("");
  // Transient: true after a "forgot password" OTP verify, so the
  // set-password gate forces a NEW password even though the account
  // already has one (has_password stays true). In-memory only — if the
  // tab is closed mid-reset, the old password simply still works.
  const [mustSetPassword, setMustSetPassword] = useState(false);

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
      logger.error("link_customer_to_human RPC error", rpcErr, {
        tags: { hook: "useCustomerAuth", op: "linkHumanRecord" },
      });
      return null;
    }

    // The RPC returns customer-safe human fields — Supabase surfaces this as an array.
    if (!data || data.length === 0) {
      logger.warn("No human record found or already claimed for current user", {
        tags: { hook: "useCustomerAuth", op: "linkHumanRecord" },
      });
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
          logger.error("useCustomerAuth: error linking human record", err, {
            tags: { hook: "useCustomerAuth", op: "applySession" },
          });
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
        logger.warn("useCustomerAuth: auth startup timed out after 5s", {
          tags: { hook: "useCustomerAuth", op: "startup" },
        });
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
          logger.error("useCustomerAuth: failed to get initial session", sessionErr, {
            tags: { hook: "useCustomerAuth", op: "getSession" },
          });
          finish();
          return;
        }
        applySession(data?.session ?? null);
      })
      .catch((err) => {
        logger.error("useCustomerAuth: unexpected getSession error", err, {
          tags: { hook: "useCustomerAuth", op: "getSession" },
        });
        finish();
      });

    return () => {
      cancelled = true;
      sessionRun += 1;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [linkHumanRecord]);

  /**
   * Pre-flight phone check — NO SMS. Asks the salon's database (via the
   * rate-limited customer-phone-on-file Edge Function) whether the phone
   * is on file and whether its account already has a password. The login
   * page uses the answer to decide: password field (returning), text-a-code
   * (first login), or "not on file" error.
   *
   * Going through the Edge Function rather than the RPC directly is what
   * enforces the rate cap (the RPC is service_role only). captchaToken is
   * the Cloudflare Turnstile token, kept for the follow-up auth call.
   *
   * Returns { on_file, has_password } on success, or { error } on failure.
   */
  const checkPhone = useCallback(async (phoneNumber) => {
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
    phoneRef.current = normalisedPhone;
    setPhone(normalisedPhone);

    const { data: lookupData, error: lookupErr } = await supabase.functions
      .invoke("customer-phone-on-file", {
        body: { phone: normalisedPhone },
      });

    if (lookupErr) {
      // Supabase wraps non-2xx responses in FunctionsHttpError. Pull the
      // JSON body off so we can show a tailored message for the rate-limit
      // case instead of a generic failure.
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
      // (Supabase returns 404 / FunctionsRelayError).
      const status = lookupErr.context?.status;
      const name = lookupErr.name || "";
      const looksLikeMissingFn =
        status === 404 ||
        name === "FunctionsRelayError" ||
        name === "FunctionsFetchError";
      if (looksLikeMissingFn) {
        logger.error(
          "customer-phone-on-file Edge Function not reachable. Did you run `supabase functions deploy customer-phone-on-file`?",
          lookupErr,
          {
            tags: { hook: "useCustomerAuth", op: "checkPhone" },
            extra: { errPayload },
          },
        );
        setError(
          "Login service isn't available right now. Please contact the salon.",
        );
        return { error: lookupErr };
      }
      logger.error("customer-phone-on-file function error", lookupErr, {
        tags: { hook: "useCustomerAuth", op: "checkPhone" },
        extra: { errPayload },
      });
      setError(OTP_SEND_ERROR);
      return { error: lookupErr };
    }

    if (!lookupData?.on_file) {
      // Not an error any more — an unknown number is the entry point to
      // self-signup ("Join the Pack"). The login page offers to register
      // it rather than showing a dead-end. No setError here.
      return { on_file: false, has_password: false };
    }

    // has_password may be undefined if an older Edge Function build is still
    // live (returns { on_file } only). Treat undefined as false → the
    // customer gets the code path, which still works and puts them on the
    // password track for next time. Safe default.
    return {
      on_file: true,
      has_password: lookupData.has_password === true,
    };
  }, []);

  /**
   * Send an SMS OTP to the already-checked phone (set by checkPhone).
   * Twilio sends only happen here, after checkPhone has confirmed the
   * number is on file. captchaToken comes from the Turnstile widget.
   */
  const sendOtp = useCallback(async (captchaToken) => {
    if (!supabase) {
      setError("Not connected.");
      return { error: { message: "Offline" } };
    }
    const targetPhone = phoneRef.current;
    if (!targetPhone) {
      setError(PHONE_FORMAT_ERROR);
      return { error: { message: "No phone" } };
    }
    setError(null);

    const otpOptions = captchaToken ? { options: { captchaToken } } : {};
    const { error: err } = await supabase.auth.signInWithOtp({
      phone: targetPhone,
      ...otpOptions,
    });

    if (err) {
      logger.error("Customer OTP send failed", err, {
        tags: { hook: "useCustomerAuth", op: "sendOtp" },
      });
      setError(OTP_SEND_ERROR);
      return { error: err };
    }

    setOtpSent(true);
    return { success: true };
  }, []);

  /**
   * Sign in a returning customer with phone + password. The phone was
   * set by checkPhone. captchaToken is required when project-wide captcha
   * protection is on (it is, for OTP) — Supabase rejects the call without
   * it. On success the SIGNED_IN event links the human record via
   * applySession; on failure we show a deliberately generic error.
   */
  const signInWithPassword = useCallback(async (password, captchaToken) => {
    if (!supabase) {
      setError("Not connected.");
      return { error: { message: "Offline" } };
    }
    const targetPhone = phoneRef.current;
    if (!targetPhone) {
      setError(PHONE_FORMAT_ERROR);
      return { error: { message: "No phone" } };
    }
    setError(null);

    const { data, error: err } = await supabase.auth.signInWithPassword({
      phone: targetPhone,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });

    if (err) {
      logger.error("Customer password sign-in failed", err, {
        tags: { hook: "useCustomerAuth", op: "signInWithPassword" },
      });
      setError(PASSWORD_LOGIN_ERROR);
      return { error: err };
    }

    return { data };
  }, []);

  // Verify the OTP code. Pass { isReset: true } from the forgot-password
  // path so the set-password gate forces a NEW password afterwards.
  const verifyOtp = useCallback(
    async (code, { isReset = false } = {}) => {
      if (!supabase) {
        setError("Not connected.");
        return { error: { message: "Offline" } };
      }
      setError(null);

      const { data, error: err } = await supabase.auth.verifyOtp({
        phone: phoneRef.current,
        token: code,
        type: "sms",
      });

      if (err) {
        logger.error("Customer OTP verification failed", err, {
          tags: { hook: "useCustomerAuth", op: "verifyOtp" },
        });
        setError(OTP_VERIFY_ERROR);
        return { error: err };
      }

      if (isReset) setMustSetPassword(true);

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
    [linkHumanRecord],
  );

  // Re-fetch the linked human record (e.g. after the onboarding gate or the
  // set-password gate saves) so the rest of the app sees the fresh values —
  // including has_password — without a full reload. Re-runs the same
  // SECURITY DEFINER link RPC.
  const refreshHumanRecord = useCallback(async () => {
    const human = await linkHumanRecord();
    setHumanRecord(human);
    return human;
  }, [linkHumanRecord]);

  // First step of self-signup: create the pending "shell" humans row for a
  // freshly-verified phone that has no record yet, then refresh so the rest
  // of the app sees the linked (pending) record. Idempotent server-side.
  const createPendingHuman = useCallback(async () => {
    if (!supabase) return null;
    const { error: rpcErr } = await createPendingCustomer(supabase);
    if (rpcErr) {
      logger.error("create_pending_customer RPC error", rpcErr, {
        tags: { hook: "useCustomerAuth", op: "createPendingHuman" },
      });
      return null;
    }
    return refreshHumanRecord();
  }, [refreshHumanRecord]);

  const clearMustSetPassword = useCallback(() => {
    setMustSetPassword(false);
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setHumanRecord(null);
    setOtpSent(false);
    setPhone("");
    phoneRef.current = "";
    setMustSetPassword(false);
  }, []);

  // Reset to phone-entry step
  const resetOtp = useCallback(() => {
    setOtpSent(false);
    setPhone("");
    phoneRef.current = "";
    setError(null);
    setMustSetPassword(false);
  }, []);

  return {
    user,
    humanRecord,
    loading,
    error,
    otpSent,
    phone,
    // Derived live from the linked record (rides atomically with humanRecord,
    // so there's no separate state to race). undefined while unlinked.
    hasPassword: humanRecord?.has_password,
    mustSetPassword,
    checkPhone,
    sendOtp,
    signInWithPassword,
    verifyOtp,
    signOut,
    resetOtp,
    refreshHumanRecord,
    createPendingHuman,
    clearMustSetPassword,
  };
}
