import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { primeBootPrefetch } from "../bootPrefetch.js";
import { logger } from "../../lib/logger";

const ROLES = { owner: "owner", staff: "staff" };

export function useAuth() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return null;

    const { data, error: err } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (err) {
      if (err.code === "PGRST116") {
        // No staff profile found — user is NOT authorized for the staff portal.
        // Staff profiles must be created by an owner via the dashboard or
        // directly in Supabase Auth. Auto-creation is disabled for security.
        logger.warn("No staff profile found — access denied", {
          tags: { hook: "useAuth", op: "fetchProfile" },
          extra: { userId },
        });
        return null;
      }

      logger.error("Failed to fetch staff profile", err, {
        tags: { hook: "useAuth", op: "fetchProfile" },
      });
      return null;
    }

    return data;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let initialDone = false;

    const finishInitialLoad = () => {
      if (!initialDone && !cancelled) {
        initialDone = true;
        setLoading(false);
      }
    };

    // Apply synchronous state updates from a session. Safe inside the
    // onAuthStateChange callback (Supabase holds the auth lock while it
    // fires subscribers, so awaiting another Supabase API here would
    // deadlock the client — notably during TOKEN_REFRESHED).
    const applySessionState = (session) => {
      if (cancelled) return;
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setStaffProfile(null);
      }
    };

    // In-flight staff_profiles fetches keyed by userId. At boot the
    // getSession() init path and the INITIAL_SESSION auth event BOTH
    // schedule a fetch for the same user — the second caller reuses the
    // first's in-flight promise so the table is read exactly once.
    // Entries are removed as soon as they settle, so later auth events
    // (e.g. TOKEN_REFRESHED) still refetch as before; the map is cleared
    // on sign-out so the next sign-in — same user or different — always
    // fetches fresh. Effect-local on purpose: a StrictMode dev remount
    // gets a fresh map, and the torn-down effect's async callbacks are
    // all behind the `cancelled` flag before any of them can fetch.
    const inflightProfileFetches = new Map();

    const fetchProfileDeduped = (userId) => {
      const inflight = inflightProfileFetches.get(userId);
      if (inflight) return inflight;
      // Start the tier-1 dashboard reads (bookings week, salon_config,
      // day_settings week) in the SAME task as the profile fetch so
      // they run concurrently instead of after the auth gate clears.
      // Initial load only — later auth events (TOKEN_REFRESHED /
      // SIGNED_IN) must not re-prime; the module-level once-flag inside
      // primeBootPrefetch is belt and braces on top of this gate. Priming
      // on the dedupe MISS keeps it to one call per request that actually
      // goes out.
      if (!initialDone) primeBootPrefetch();
      const promise = fetchProfile(userId).finally(() => {
        inflightProfileFetches.delete(userId);
      });
      inflightProfileFetches.set(userId, promise);
      return promise;
    };

    // Fetch the staff profile in a new task, after the auth lock has been
    // released. Called from both the getSession() init path and the
    // onAuthStateChange callback. Marks the initial load done once the
    // profile has been fetched (or fetch failed).
    const scheduleProfileFetch = (userId) => {
      if (cancelled) return;
      if (!userId) {
        // Signed out (or no session at boot): drop any in-flight keys so
        // a subsequent sign-in never reuses a stale promise.
        inflightProfileFetches.clear();
        finishInitialLoad();
        return;
      }
      setTimeout(async () => {
        try {
          const profile = await fetchProfileDeduped(userId);
          if (!cancelled) setStaffProfile(profile);
        } catch (err) {
          logger.error("useAuth: error fetching staff profile", err, {
            tags: { hook: "useAuth", op: "scheduleProfileFetch" },
          });
        } finally {
          finishInitialLoad();
        }
      }, 0);
    };

    const timeout = setTimeout(() => {
      if (!initialDone && !cancelled) {
        logger.warn(
          "useAuth: auth startup timed out after 5s; showing UI anyway",
          { tags: { hook: "useAuth", op: "startupTimeout" } },
        );
        finishInitialLoad();
      }
    }, 5000);

    supabase.auth
      .getSession()
      .then(({ data, error: sessionErr }) => {
        if (sessionErr) {
          logger.error("useAuth: failed to get initial session", sessionErr, {
            tags: { hook: "useAuth", op: "getSession" },
          });
          finishInitialLoad();
          return;
        }
        const session = data?.session ?? null;
        applySessionState(session);
        scheduleProfileFetch(session?.user?.id);
      })
      .catch((err) => {
        logger.error("useAuth: unexpected getSession error", err, {
          tags: { hook: "useAuth", op: "getSession" },
        });
        finishInitialLoad();
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionState(session);
      scheduleProfileFetch(session?.user?.id);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);
  const signIn = useCallback(async (email, password, captchaToken) => {
    if (!supabase) {
      setError("Supabase not configured. Running in offline mode.");
      return { error: { message: "Offline mode" } };
    }

    setError(null);
    setLoading(true);

    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
        ...(captchaToken ? { options: { captchaToken } } : {}),
      });

      if (err) {
        setError("Invalid email or password");
        return { error: err };
      }

      const profile = await fetchProfile(data?.user?.id);
      setUser(data?.user ?? null);
      setStaffProfile(profile);

      return { data };
    } catch (err) {
      logger.error("Sign in error", err, {
        tags: { hook: "useAuth", op: "signIn" },
      });
      setError("Could not sign in. Please try again.");
      return { error: err };
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    const { error: err } = await supabase.auth.signOut();
    if (err) {
      logger.error("Sign out error", err, {
        tags: { hook: "useAuth", op: "signOut" },
      });
    }

    setUser(null);
    setStaffProfile(null);
  }, []);

  const isOwner = staffProfile?.role === ROLES.owner;
  const displayName = staffProfile?.display_name || user?.email || "";

  return {
    user,
    staffProfile,
    loading,
    error,
    signIn,
    signOut,
    isOwner,
    displayName,
  };
}
