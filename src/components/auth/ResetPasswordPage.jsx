import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase/client.js";

/**
 * Handles the Supabase password recovery flow.
 * Supabase redirects here after the user clicks the reset link in their email.
 * The recovery token arrives in the URL hash — Supabase picks it up automatically
 * via onAuthStateChange (PASSWORD_RECOVERY event), giving us a session to work with.
 */
export function ResetPasswordPage() {
  const [ready, setReady] = useState(false);       // recovery session established
  const [expired, setExpired] = useState(false);   // link is invalid/expired
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Use a ref so the timeout can read the *current* ready value, not a stale closure
  const readyRef = useRef(false);

  useEffect(() => {
    if (!supabase) { setExpired(true); return; }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        readyRef.current = true;
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        readyRef.current = true;
        setReady(true);
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
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (err) {
      setError(err.message || "Could not update password. The link may have expired.");
      return;
    }

    setDone(true);
    setTimeout(() => { window.location.href = "/"; }, 2500);
  };

  const containerCls = "min-h-screen bg-brand-paper flex items-center justify-center p-5 font-sans";
  const cardCls = "w-full max-w-[400px] bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]";

  // Success
  if (done) {
    return (
      <div className={containerCls}>
        <div className={`${cardCls} text-center`}>
          <div className="text-[40px] mb-3">{"\u2705"}</div>
          <div className="text-lg font-extrabold text-slate-800 mb-2">
            Password updated!
          </div>
          <div className="text-[13px] text-slate-500">
            Taking you to the dashboard...
          </div>
        </div>
      </div>
    );
  }

  // Expired / invalid link
  if (expired) {
    return (
      <div className={containerCls}>
        <div className={`${cardCls} text-center`}>
          <div className="text-[40px] mb-3">{"\u23F1\uFE0F"}</div>
          <div className="text-lg font-extrabold text-slate-800 mb-2">
            Link expired
          </div>
          <div className="text-[13px] text-slate-500 mb-5">
            This reset link has expired or is invalid. Request a new one from the sign-in page.
          </div>
          <a
            href="/"
            className="inline-block py-2.5 px-5 bg-action text-on-action rounded-full text-sm font-bold no-underline hover:bg-brand-yellow-dark"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  // Waiting for recovery session
  if (!ready) {
    return (
      <div className={containerCls}>
        <div className={`${cardCls} text-center`}>
          <div className="text-[13px] text-slate-500">Verifying reset link...</div>
        </div>
      </div>
    );
  }

  // Set new password form
  return (
    <div className={containerCls}>
      <div className={cardCls}>
        <div className="text-center mb-6">
          <div className="text-[28px] font-display font-bold text-brand-purple">
            Smarter<span className="text-brand-yellow">Dog</span>
          </div>
          <div className="text-[13px] text-slate-500 mt-1">Salon Bookings</div>
        </div>

        <div className="text-lg font-extrabold text-slate-800 mb-1">
          Set a new password
        </div>
        <div className="text-[13px] text-slate-500 mb-5">
          Choose something strong — at least 12 characters.
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="Min. 12 characters"
              className="w-full py-3 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-[inherit] box-border outline-none text-slate-800 focus:border-brand-cyan"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(""); }}
              placeholder="Same again"
              className="w-full py-3 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-[inherit] box-border outline-none text-slate-800 focus:border-brand-cyan"
            />
          </div>

          {error && (
            <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light py-2 px-3 rounded-lg">
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
      </div>
    </div>
  );
}
