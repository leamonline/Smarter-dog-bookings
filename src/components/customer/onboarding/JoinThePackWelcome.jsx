import { useState } from "react";
import { CenteredScreen } from "../../ui/PageShell.jsx";
import { PawPrint } from "lucide-react";
import { SALON_WHATSAPP_URL } from "../../../constants/salonContact.ts";

/**
 * Shown to a freshly-verified phone that has no salon record yet — the
 * entry point to self-signup. Replaces the old "we don't have your number
 * on file" dead-end. Tapping "Join the Pack" creates the pending shell
 * record (create_pending_customer) via onStart, after which the normal
 * gate chain takes over: set a password, then answer the questions.
 */
export function JoinThePackWelcome({ onStart, onSignOut }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  async function handleStart() {
    setStarting(true);
    setError(null);
    const result = await onStart?.();
    // On success the parent flips humanRecord and this screen unmounts; if it
    // comes back null, something went wrong server-side.
    if (!result) {
      setError("We couldn't start your sign-up just now. Please try again.");
      setStarting(false);
    }
  }

  return (
    <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
      <div className="w-full max-w-[460px] bg-white p-7 rounded-2xl border border-slate-200 shadow-sm text-center">
        <PawPrint size={32} className="text-brand-purple mx-auto mb-2" aria-hidden="true" />
        <h1 className="text-xl font-bold text-brand-purple font-display">
          Join the Pack
        </h1>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          We don&apos;t have you on file yet — let&apos;s get you set up. It
          takes a minute: choose a password, then tell us about you and your
          dog. We&apos;ll check everything over and text you when you&apos;re
          ready to book.
        </p>

        {error && (
          <div role="alert" className="portal-alert portal-alert--error my-3 text-[13px]">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="portal-btn portal-btn--cta w-full mt-5"
        >
          {starting ? "Setting up…" : "Join the Pack"}
        </button>

        <p className="text-[13px] text-slate-500 mt-4 leading-relaxed">
          Already a customer? Your number may be stored differently —{" "}
          <a
            href={SALON_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-purple font-semibold underline"
          >
            message the salon
          </a>{" "}
          and we&apos;ll sort it.
        </p>

        <button
          type="button"
          onClick={onSignOut}
          className="block mx-auto mt-3 text-[13px] text-slate-500 bg-transparent border-none cursor-pointer font-semibold"
        >
          Sign out
        </button>
      </div>
    </CenteredScreen>
  );
}
