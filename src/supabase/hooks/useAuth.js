import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";

const ROLES = { owner: "owner", staff: "staff" };

export function useAuth() {
  const [user, setUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch staff profile for a given user id
  const fetchProfile = useCallback(async (userId) => {
    if (!supabase) return null;
    const { data, error: err } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (err) {
      // If no profile exists yet, create one with default "staff" role
      if (err.code === "PGRST116") {
        const { data: newProfile } = await supabase
          .from("staff_profiles")
          .insert({ user_id: userId, role: ROLES.staff, display_name: "" })
          .select()
          .single();
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

    // Only use onAuthStateChange — it fires INITIAL_SESSION on mount,
    // so we don't need a separate getSession() call (which causes lock contention).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;

        if (session?.user) {
          setUser(session.user);
          const profile = await fetchProfile(session.user.id);
          if (!cancelled) setStaffProfile(profile);
        } else {
          setUser(null);
          setStaffProfile(null);
        }

        // Mark loading done after the initial session check
        if (loading) setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);
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
      setError(err.message);
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
      setError(err.message);
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
