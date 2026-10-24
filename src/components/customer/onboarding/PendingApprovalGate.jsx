import { useState } from "react";
import { CenteredScreen } from "../../ui/PageShell.jsx";
import { PawPrint, Clock } from "lucide-react";
import { SALON_WHATSAPP_URL } from "../../../constants/salonContact.ts";

/**
 * Shown after a self-signup customer finishes onboarding but before staff
 * approve them. Blocks the dashboard + booking (booking is also gated
 * server-side in create_customer_booking_group). "Check again" re-reads the
 * approval state so an approved customer drops straight into the dashboard
 * without a full reload.
 *
 * `claimsExisting` is the variant for a customer whose signup name matched a
 * record already on the books (humans.claims_human_id): staff will LINK this
 * login to that record rather than approve a new one, so the copy says so
 * instead of "we'll check your details".
 */
export function PendingApprovalGate({ claimsExisting = false, onRefresh, onSignOut }) {
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
        {claimsExisting ? (
          <>
            <h1 className="text-xl font-bold text-brand-purple font-display">
              Thanks — looks like we already know you!
            </h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              This number is new to us, but your name matches someone already on
              our books. One of the team will link this login to your existing
              record — you don&apos;t need to do anything. We usually do this on
              salon days, Monday to Wednesday, and we&apos;ll send you a message
              as soon as it&apos;s done so you can book as usual.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-brand-purple font-display">
              Thanks — you&apos;re on the list!
            </h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              We&apos;ve got your details and one of the team will check everything
              over. We usually look at new sign-ups on salon days, Monday to
              Wednesday, and we&apos;ll message you as soon as you&apos;re approved —
              then you can book your first appointment.
            </p>
          </>
        )}

        {/* Timing is deliberately "usually", never a deadline: the owner chose
            soft wording (23 Oct 2026, #1073) so a holiday closure can't turn
            it into a broken promise. */}
        <p className="text-sm text-slate-500 mt-3 leading-relaxed">
          Got a question while you wait?{" "}
          <a
            href={SALON_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-purple underline"
          >
            Message us on WhatsApp
          </a>
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
