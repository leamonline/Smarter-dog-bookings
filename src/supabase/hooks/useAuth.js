import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";

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
        console.warn("No staff profile found for user:", userId, "— access denied.");
        return null;
      }

      console.error("Failed to fetch staff profile:", err);
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

    // Fetch the staff profile in a new task, after the auth lock has been
    // released. Called from both the getSession() init path and the
    // onAuthStateChange callback. Marks the initial load done once the
    // profile has been fetched (or fetch failed).
    const scheduleProfileFetch = (userId) => {
      if (cancelled) return;
      if (!userId) {
        finishInitialLoad();
        return;
      }
      setTimeout(async () => {
        try {
          const profile = await fetchProfile(userId);
          if (!cancelled) setStaffProfile(profile);
        } catch (err) {
          console.error("useAuth: error fetching staff profile:", err);
        } finally {
          finishInitialLoad();
        }
      }, 0);
    };

    const timeout = setTimeout(() => {
      if (!initialDone && !cancelled) {
        console.warn(
          "useAuth: auth startup timed out after 5s; showing UI anyway",
        );
        finishInitialLoad();
      }
    }, 5000);

    supabase.auth
      .getSession()
      .then(({ data, error: sessionErr }) => {
        if (sessionErr) {
          console.error("useAuth: failed to get initial session:", sessionErr);
          finishInitialLoad();
          return;
        }
        const session = data?.session ?? null;
        applySessionState(session);
        scheduleProfileFetch(session?.user?.id);
      })
      .catch((err) => {
        console.error("useAuth: unexpected getSession error:", err);
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
  const signIn = useCallback(async (email, password) => {
    if (!supabase) {
      setError("Supabase not configured. Running in offline mode.");
      return { error: { message: "Offline mode" } };
    }

    setError(null);

    const { data, error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setError("Invalid email or password");
      return { error: err };
    }

    return { data };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    const { error: err } = await supabase.auth.signOut();
    if (err) console.error("Sign out error:", err);

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
