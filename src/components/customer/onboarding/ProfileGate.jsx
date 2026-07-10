import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { CenteredScreen } from "../../ui/PageShell.jsx";
import { PawPrint } from "lucide-react";
import { AddressPicker } from "./AddressPicker.jsx";
import { friendlySaveError } from "../../../utils/friendlyError";
import { isRealPersonName } from "../../../utils/text";
import {
  SALON_TERMS_URL,
  SALON_MATTED_COAT_POLICY_URL,
  SALON_PRIVACY_URL,
  POLICIES_VERSION,
} from "../../../constants/salonPolicies.ts";

/**
 * Blocking onboarding screen. Shown after login when a customer's profile is
 * incomplete (missing first name, surname, address, or policy agreement).
 * Replaces the dashboard *and* the booking route until it's done, so a
 * customer can't book without these on file. The same requirement is enforced
 * server-side in create_customer_booking_group().
 *
 * Address capture is handled by the shared AddressPicker (postcode lookup with
 * a manual fallback). This gate is for already-approved customers; brand-new
 * self-signups go through JoinThePackOnboarding instead.
 */
export function ProfileGate({ humanRecord, onComplete, onSignOut }) {
  const toast = useToast();

  const [name, setName] = useState(humanRecord?.name?.trim() || "");
  const [surname, setSurname] = useState(humanRecord?.surname?.trim() || "");
  const existingAddress = humanRecord?.address?.trim() || "";

  // { ready, address, postcode, keepingExisting } reported by AddressPicker.
  const [addr, setAddr] = useState({
    ready: Boolean(existingAddress),
    address: existingAddress || null,
    postcode: null,
    keepingExisting: Boolean(existingAddress),
  });

  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit =
    // Real name, not just non-empty — same placeholder rule as signup.
    isRealPersonName(name) &&
    surname.trim() !== "" &&
    addr.ready &&
    policiesAccepted &&
    !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit || !supabase || !humanRecord?.id) return;
    setSaving(true);
    setError(null);

    // NB: never include `phone` here — humans.phone has a normalisation
    // trigger that rejects non-E.164 service edits.
    const payload = {
      name: name.trim(),
      surname: surname.trim(),
      policies_accepted_at: new Date().toISOString(),
      policies_version: POLICIES_VERSION,
    };

    if (!addr.keepingExisting) {
      payload.address = addr.address;
      if (addr.postcode) payload.postcode = addr.postcode;
    }

    const { error: err } = await supabase
      .from("humans")
      .update(payload)
      .eq("id", humanRecord.id);

    setSaving(false);
    if (err) {
      // Never splice the raw DB/RLS message into customer copy.
      setError(friendlySaveError(err, "We couldn't save your details just now. Please try again, or message us if it keeps happening."));
      return;
    }
    toast.show("Thanks — you're all set", "success");
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
            Just a couple of details
          </h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Before your first booking we need your name, address and an OK on our
            policies. Takes about a minute.
          </p>
        </div>

        {/* Your details */}
        <fieldset className="mb-5">
          <legend className="text-[13px] font-semibold text-[var(--sd-navy)] mb-2">
            Your name
          </legend>
          <div className="flex gap-2">
            <input
              aria-label="First name"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name"
              className="portal-input"
            />
            <input
              aria-label="Surname"
              autoComplete="family-name"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              placeholder="Surname"
              className="portal-input"
            />
          </div>
        </fieldset>

        {/* Address */}
        <fieldset className="mb-5">
          <legend className="text-[13px] font-semibold text-[var(--sd-navy)] mb-2">
            Your address
          </legend>
          <AddressPicker existingAddress={existingAddress} onChange={setAddr} />
        </fieldset>

        {/* Policies */}
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={policiesAccepted}
            onChange={(e) => setPoliciesAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-brand-purple shrink-0"
          />
          <span className="text-[13px] text-[var(--sd-navy)] leading-relaxed">
            I agree to Smarter Dog&apos;s{" "}
            <a href={SALON_TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-brand-purple font-semibold underline">
              Terms
            </a>
            ,{" "}
            <a href={SALON_MATTED_COAT_POLICY_URL} target="_blank" rel="noopener noreferrer" className="text-brand-purple font-semibold underline">
              Matted Coat Policy
            </a>{" "}
            and{" "}
            <a href={SALON_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-brand-purple font-semibold underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>

        {error && (
          <div role="alert" className="portal-alert portal-alert--error mb-3 text-[13px]">
            {error}
          </div>
        )}

        <button type="submit" className="portal-btn portal-btn--cta w-full" disabled={!canSubmit}>
          {saving ? "Saving…" : "Save and continue"}
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
