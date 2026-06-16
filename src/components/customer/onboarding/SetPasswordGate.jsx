import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { CenteredScreen } from "../../ui/PageShell.jsx";
import { isPasswordPwned } from "../../../utils/pwnedPassword";
import { PawPrint, Eye, EyeOff, KeyRound } from "lucide-react";

// Minimum we ask customers for. Kept gentle for a non-technical, mostly
// mobile audience (staff use 12). The Supabase project's own
// "Minimum password length" policy is the real floor — if it's set higher
// than this, updateUser() rejects and we surface that server message
// verbatim, so the two can never silently disagree.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Blocking screen that requires a customer to set a password before they
 * reach the dashboard. Shown by CustomerApp when the account has no
 * password yet (first login) or after a forgot-password code sign-in.
 *
 * This is what lets returning customers sign in with phone + password
 * instead of a paid SMS code every time. It mirrors ProfileGate: it
 * replaces the dashboard until done, and on success calls onComplete()
 * (which refreshes the linked record — so has_password flips true — and
 * clears the transient reset flag).
 *
 * mode: "set"   → first time ("Set a password")
 *       "reset" → after forgot-password ("Set a new password")
 */
export function SetPasswordGate({ mode = "set", username, onComplete, onSignOut }) {
  const toast = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isReset = mode === "reset";
  const heading = isReset ? "Set a new password" : "Set a password";

  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH && password === confirm && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Please use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match. Please check and try again.");
      return;
    }
    if (!supabase) {
      setError("We couldn't save your password just now. Please try again.");
      return;
    }

    setSaving(true);

    // Free stand-in for Supabase's Pro-only leaked-password protection:
    // reject passwords known to be in a breach (HaveIBeenPwned, k-anonymity).
    // Fails open, so a network blip never blocks setting a password.
    if (await isPasswordPwned(password)) {
      setSaving(false);
      setError(
        "That password has appeared in a known data breach, so it isn't safe to use. Please choose a different one.",
      );
      return;
    }

    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (err) {
      // Surface the server message verbatim — covers a stricter project-wide
      // password policy than our client check expects.
      setError(err.message || "We couldn't save your password. Please try again.");
      return;
    }

    toast.show(
      isReset ? "Password updated" : "Password set — you're all done",
      "success",
    );
    await onComplete?.();
  }

  return (
    <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[460px] bg-white p-7 rounded-2xl border border-slate-200 shadow-sm"
      >
        <div className="text-center mb-5">
          <PawPrint size={32} className="text-brand-purple mx-auto mb-2" aria-hidden="true" />
          <h1 className="text-xl font-bold text-brand-purple font-display">
            {heading}
          </h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            {isReset
              ? "Choose a new password — you'll use it with your mobile number to sign in from now on."
              : "Set a password so next time you can sign in with just your mobile number and password — no waiting for a text."}
          </p>
        </div>

        {/* Read-only identifier the customer signs in with. Visible so they
            know which account this is, and — crucially — a real in-DOM
            input with autocomplete="username" so the browser's password
            manager attaches the phone number to the credential it offers to
            save. tabIndex={-1} + readOnly keep it informational, not an edit
            target. Rendered before the password fields so managers pair
            username → new-password in document order. */}
        {username && (
          <div className="mb-4">
            <label
              htmlFor="customer-username"
              className="text-[13px] font-semibold text-[var(--sd-navy)] block mb-1.5"
            >
              You&apos;re setting a password for
            </label>
            <input
              id="customer-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              readOnly
              tabIndex={-1}
              className="portal-input w-full bg-slate-50 text-slate-600"
            />
          </div>
        )}

        <fieldset className="mb-4">
          <legend className="text-[13px] font-semibold text-[var(--sd-navy)] mb-2">
            {isReset ? "New password" : "Password"}
          </legend>

          <div className="relative">
            <input
              aria-label={isReset ? "New password" : "Password"}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              className="portal-input w-full pr-11"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[var(--sd-navy)] bg-transparent border-none cursor-pointer p-1"
            >
              {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>

          <input
            aria-label="Confirm password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
            placeholder="Type it again"
            className="portal-input w-full mt-2"
          />
        </fieldset>

        {error && (
          <div role="alert" className="portal-alert portal-alert--error mb-3 text-[13px]">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="portal-btn portal-btn--cta w-full inline-flex items-center justify-center gap-2"
          disabled={!canSubmit}
        >
          <KeyRound size={16} aria-hidden="true" />
          {saving ? "Saving…" : isReset ? "Save new password" : "Set password and continue"}
        </button>

        <button
          type="button"
          onClick={onSignOut}
          className="block mx-auto mt-3 text-[13px] text-slate-500 bg-transparent border-none cursor-pointer font-semibold"
        >
          Sign out
        </button>
      </form>
    </CenteredScreen>
  );
}
