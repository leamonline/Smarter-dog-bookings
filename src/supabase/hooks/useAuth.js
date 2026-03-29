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
        const { data: newProfile, error: insertErr } = await supabase
          .from("staff_profiles")
          .insert({ user_id: userId, role: ROLES.staff, display_name: "" })
          .select()
          .single();

        if (insertErr) {
          console.error("Failed to create staff profile:", insertErr);
          return null;
        }

        return newProfile;
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

    const syncFromSession = async (session) => {
      if (cancelled) return;

      try {
        if (session?.user) {
          setUser(session.user);
          const profile = await fetchProfile(session.user.id);
          if (!cancelled) setStaffProfile(profile);
        } else {
          setUser(null);
          setStaffProfile(null);
        }
      } catch (err) {
        console.error("useAuth: error while syncing auth state:", err);
      } finally {
        finishInitialLoad();
      }
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
        return syncFromSession(data?.session ?? null);
      })
      .catch((err) => {
        console.error("useAuth: unexpected getSession error:", err);
        finishInitialLoad();
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await syncFromSession(session);
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

  const signUp = useCallback(async (email, password) => {
    if (!supabase) {
      setError("Supabase not configured. Running in offline mode.");
      return { error: { message: "Offline mode" } };
    }

    setError(null);

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
    });

    if (err) {
      setError("Sign-up failed. Please try again.");
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
  const isStaff = !!staffProfile;
  const displayName = staffProfile?.display_name || user?.email || "";

  return {
    user,
    staffProfile,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    isOwner,
    isStaff,
    displayName,
  };
}
