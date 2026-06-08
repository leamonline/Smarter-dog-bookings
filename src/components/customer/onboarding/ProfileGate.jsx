import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { CenteredScreen } from "../../ui/PageShell.jsx";
import { PawPrint, MapPin, Loader2, Search } from "lucide-react";
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
 * Address capture: the customer types their postcode and picks their property
 * from a dropdown of real Royal Mail PAF addresses (e.g. "6 Back Lane, Mottram,
 * Hyde, SK14 6JE"). The lookup goes through the `postcode-lookup` Edge Function
 * (which holds the APITier key server-side + rate-limits). A manual-entry
 * fallback covers a missing premises or a lookup outage so a booking is never
 * blocked by the address step.
 */
export function ProfileGate({ humanRecord, onComplete, onSignOut }) {
  const toast = useToast();

  const [name, setName] = useState(humanRecord?.name?.trim() || "");
  const [surname, setSurname] = useState(humanRecord?.surname?.trim() || "");

  const existingAddress = humanRecord?.address?.trim() || "";
  // If the salon already has an address for them (staff-entered, etc.), keep
  // it and only ask for the policy tick — don't make them re-type it.
  const [editingAddress, setEditingAddress] = useState(!existingAddress);

  const [postcode, setPostcode] = useState("");
  const [normalisedPostcode, setNormalisedPostcode] = useState("");
  // idle | searching | results | none | invalid | error
  const [lookupStatus, setLookupStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState("");

  // Manual fallback (no lookup) — free-text address.
  const [manualMode, setManualMode] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [manualPostcode, setManualPostcode] = useState("");

  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function findAddresses() {
    const pc = postcode.trim();
    if (!pc) return;
    setError(null);
    setResults([]);
    setSelectedIndex("");
    setLookupStatus("searching");
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "postcode-lookup",
        { body: { postcode: pc } },
      );
      if (fnErr) {
        let payload = null;
        try {
          payload = await fnErr.context?.json?.();
        } catch {
          // ignore — fall through to generic error
        }
        if (payload?.error === "invalid_postcode") {
          setLookupStatus("invalid");
          return;
        }
        if (payload?.error === "rate_limited") {
          setLookupStatus("error");
          setError("Too many lookups just now — please wait a moment and try again.");
          return;
        }
        setLookupStatus("error");
        return;
      }
      const addrs = Array.isArray(data?.addresses) ? data.addresses : [];
      setNormalisedPostcode(data?.postcode || pc.toUpperCase());
      if (addrs.length === 0) {
        setLookupStatus("none");
        return;
      }
      setResults(addrs);
      setLookupStatus("results");
      if (addrs.length === 1) setSelectedIndex("0");
    } catch {
      setLookupStatus("error");
    }
  }

  const keepingExisting = Boolean(existingAddress) && !editingAddress;
  const pickedReady =
    lookupStatus === "results" &&
    selectedIndex !== "" &&
    Boolean(results[Number(selectedIndex)]);
  const manualReady = manualMode && manualAddress.trim() !== "";
  const addressReady = keepingExisting || manualReady || pickedReady;

  const canSubmit =
    name.trim() !== "" &&
    surname.trim() !== "" &&
    addressReady &&
    policiesAccepted &&
    !saving;

  function enterManual() {
    setManualMode(true);
    setLookupStatus("idle");
    setResults([]);
    setSelectedIndex("");
  }

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

    if (!keepingExisting) {
      if (manualMode) {
        payload.address = manualAddress.trim();
        if (manualPostcode.trim()) payload.postcode = manualPostcode.trim().toUpperCase();
      } else {
        const sel = results[Number(selectedIndex)];
        payload.address = sel.line;
        payload.postcode = sel.postcode || normalisedPostcode;
      }
    }

    const { error: err } = await supabase
      .from("humans")
      .update(payload)
      .eq("id", humanRecord.id);

    setSaving(false);
    if (err) {
      setError(`We couldn't save your details: ${err.message}. Please try again.`);
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

          {keepingExisting ? (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="flex-1 text-sm text-[var(--sd-navy)]">
                {existingAddress}
                <button
                  type="button"
                  className="block mt-1 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer"
                  onClick={() => setEditingAddress(true)}
                >
                  Update address
                </button>
              </div>
            </div>
          ) : manualMode ? (
            <>
              <textarea
                aria-label="Full address"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder={"Your full address\ne.g. 6 Back Lane, Mottram, Hyde"}
                rows={3}
                className="portal-input w-full resize-y"
              />
              <input
                aria-label="Postcode"
                autoComplete="postal-code"
                value={manualPostcode}
                onChange={(e) => setManualPostcode(e.target.value)}
                placeholder="Postcode"
                className="portal-input uppercase mt-2"
              />
              <button
                type="button"
                className="block mt-2 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer"
                onClick={() => {
                  setManualMode(false);
                  setLookupStatus("idle");
                }}
              >
                Search by postcode instead
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  aria-label="Postcode"
                  autoComplete="postal-code"
                  value={postcode}
                  onChange={(e) => {
                    setPostcode(e.target.value);
                    if (lookupStatus !== "idle") setLookupStatus("idle");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      findAddresses();
                    }
                  }}
                  placeholder="Enter your postcode"
                  className="portal-input uppercase"
                />
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary portal-btn--small whitespace-nowrap"
                  onClick={findAddresses}
                  disabled={lookupStatus === "searching" || !postcode.trim()}
                >
                  {lookupStatus === "searching" ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      <Search size={14} aria-hidden="true" /> Find address
                    </>
                  )}
                </button>
              </div>

              {lookupStatus === "results" && (
                <select
                  aria-label="Select your address"
                  value={selectedIndex}
                  onChange={(e) => setSelectedIndex(e.target.value)}
                  className="portal-input mt-2.5 w-full"
                >
                  <option value="">
                    {results.length} address{results.length === 1 ? "" : "es"} found — select yours…
                  </option>
                  {results.map((a, i) => (
                    <option key={a.udprn || i} value={String(i)}>
                      {a.line}
                    </option>
                  ))}
                </select>
              )}

              {lookupStatus === "invalid" && (
                <p className="text-[13px] text-brand-coral mt-1.5">
                  That doesn&apos;t look like a full UK postcode. Please check and try again.
                </p>
              )}
              {lookupStatus === "none" && (
                <p className="text-[13px] text-brand-coral mt-1.5">
                  No addresses found for that postcode.
                </p>
              )}
              {lookupStatus === "error" && (
                <p className="text-[13px] text-brand-coral mt-1.5">
                  Couldn&apos;t search just now — please try again, or enter your address manually.
                </p>
              )}

              <button
                type="button"
                className="block mt-2 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer"
                onClick={enterManual}
              >
                Can&apos;t find your address? Enter it manually
              </button>
            </>
          )}
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
