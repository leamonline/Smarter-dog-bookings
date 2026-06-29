import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase/client.js";
import { CenteredScreen, PortalCard } from "../ui/PageShell.jsx";
import { isPasswordPwned } from "../../utils/pwnedPassword";

/**
 * Handles the Supabase password recovery flow.
 * Supabase redirects here after the user clicks the reset link in their email.
 * The recovery token arrives in the URL hash — Supabase picks it up automatically
 * via onAuthStateChange (PASSWORD_RECOVERY event), giving us a session to work with.
 */
export function ResetPasswordPage() {
  const [ready, setReady] = useState(false);       // recovery session established
  const [expired, setExpired] = useState(false);   // link is invalid/expired
  const [email, setEmail] = useState("");          // staff email from the recovery session
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Use a ref so the timeout can read the *current* ready value, not a stale closure
  const readyRef = useRef(false);

  useEffect(() => {
    if (!supabase) { setExpired(true); return; }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        readyRef.current = true;
        setReady(true);
        if (session?.user?.email) setEmail(session.user.email);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        readyRef.current = true;
        setReady(true);
        if (data.session.user?.email) setEmail(data.session.user.email);
      }
    });

    const timeout = setTimeout(() => {
      if (!readyRef.current) setExpired(true);
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Password needs to be 12 characters or longer.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match — give them another look.");
      return;
    }

    setSaving(true);

    // Reject known-breached passwords (HaveIBeenPwned, k-anonymity). A free
    // stand-in for Supabase's Pro-only leaked-password protection; fails open.
    if (await isPasswordPwned(password)) {
      setSaving(false);
      setError("That password isn't safe — it's been in a data breach. Pick a different one.");
      return;
    }

    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (err) {
      setError(err.message || "Something went wrong updating your password — the link might've expired. Give it another go or ask for a new one.");
      return;
    }

    setDone(true);
    setTimeout(() => { window.location.href = "/"; }, 2500);
  };

  // Success
  if (done) {
    return (
      <CenteredScreen>
        <PortalCard className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-center">
          <div className="text-[40px] mb-3">{"\u2705"}</div>
          <div className="text-lg font-extrabold text-slate-800 mb-2">
            Password updated — nice one!
          </div>
          <div className="text-body text-slate-500">
            Redirecting to the dashboard…
          </div>
        </PortalCard>
      </CenteredScreen>
    );
  }

  // Expired / invalid link
  if (expired) {
    return (
      <CenteredScreen>
        <PortalCard className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-center">
          <div className="text-[40px] mb-3">{"\u23F1\uFE0F"}</div>
          <div className="text-lg font-extrabold text-slate-800 mb-2">
            Link expired
          </div>
          <div className="text-body text-slate-500 mb-5">
            That reset link has expired or isn't valid anymore. Head back to sign in and ask for a new one.
          </div>
          <a
            href="/"
            className="inline-block py-2.5 px-5 bg-action text-on-action rounded-full text-sm font-bold no-underline hover:bg-brand-yellow-dark"
          >
            Back to sign in
          </a>
        </PortalCard>
      </CenteredScreen>
    );
  }

  // Waiting for recovery session
  if (!ready) {
    return (
      <CenteredScreen>
        <PortalCard className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-center">
          <div className="text-body text-slate-500">Verifying your reset link…</div>
        </PortalCard>
      </CenteredScreen>
    );
  }

  // Set new password form
  return (
    <CenteredScreen>
      <PortalCard className="rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
        <div className="text-center mb-6">
          <div className="text-[28px] font-display font-bold text-brand-purple">
            Smarter<span className="text-brand-yellow">Dog</span>
          </div>
          <div className="text-body text-slate-500 mt-1">Salon Bookings</div>
        </div>

        <div className="text-lg font-extrabold text-slate-800 mb-1">
          Set a new password
        </div>
        <div className="text-body text-slate-500 mb-5">
          Choose something strong — 12 characters or longer.
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Hidden username anchor carrying the staff email from the recovery
              session, so the password manager attaches the new password to the
              right account when it offers to save. sr-only keeps it in the DOM
              (managers ignore display:none) without showing it. */}
          {email && (
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />
          )}

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="12 characters or longer"
              className="w-full py-3 px-4 rounded-control border-[1.5px] border-slate-200 text-base font-[inherit] box-border outline-none text-slate-800 focus:border-brand-teal"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(""); }}
              placeholder="Same again"
              className="w-full py-3 px-4 rounded-control border-[1.5px] border-slate-200 text-base font-[inherit] box-border outline-none text-slate-800 focus:border-brand-teal"
            />
          </div>

          {error && (
            <div className="text-body text-brand-coral font-semibold bg-brand-coral-light py-2 px-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className={`w-full py-3 rounded-full border-none text-sm font-bold font-[inherit] mt-1 ${
              saving
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-action text-on-action cursor-pointer hover:bg-brand-yellow-dark"
            }`}
          >
            {saving ? "Saving..." : "Set new password"}
          </button>
        </form>
      </PortalCard>
    </CenteredScreen>
  );
}
