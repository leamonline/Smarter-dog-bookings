import { useState } from "react";
import { CenteredScreen } from "../../ui/PageShell.jsx";
import { PawPrint, Clock } from "lucide-react";

/**
 * Shown after a self-signup customer finishes onboarding but before staff
 * approve them. Blocks the dashboard + booking (booking is also gated
 * server-side in create_customer_booking_group). "Check again" re-reads the
 * approval state so an approved customer drops straight into the dashboard
 * without a full reload.
 */
export function PendingApprovalGate({ onRefresh, onSignOut }) {
  const [checking, setChecking] = useState(false);

  async function handleCheck() {
    setChecking(true);
    try {
      await onRefresh?.();
    } finally {
      setChecking(false);
    }
  }

  return (
    <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
      <div className="w-full max-w-[460px] bg-white p-7 rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="relative inline-block mb-2">
          <PawPrint size={32} className="text-brand-purple mx-auto" aria-hidden="true" />
          <Clock
            size={16}
            className="absolute -right-1 -bottom-1 text-brand-purple bg-white rounded-full"
            aria-hidden="true"
          />
        </div>
        <h1 className="text-xl font-bold text-brand-purple font-display">
          Thanks — you&apos;re on the list!
        </h1>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          We&apos;ve got your details and one of the team will check everything
          over. As soon as you&apos;re approved we&apos;ll send you a message —
          then you can book your first appointment.
        </p>

        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="portal-btn portal-btn--secondary w-full mt-5"
        >
          {checking ? "Checking…" : "Check again"}
        </button>

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
