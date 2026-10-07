import { useState, useEffect } from "react";
import { useCustomerOnboardingActions } from "../../../supabase/hooks/useCustomerOnboardingActions";
import { MapPin, Loader2, Search } from "lucide-react";

/**
 * Postcode-driven UK address picker, shared by the customer onboarding
 * screens (ProfileGate and the Join the Pack signup).
 *
 * The customer types a postcode and picks their property from a dropdown of
 * real Royal Mail PAF addresses, fetched through the `postcode-lookup` Edge
 * Function (which holds the APITier key server-side + rate-limits). A
 * manual-entry fallback covers a missing premises or a lookup outage so
 * onboarding is never blocked by the address step.
 *
 * If `existingAddress` is supplied (staff already have one on file) it's kept
 * by default and the customer only has to confirm — with an "Update address"
 * escape hatch.
 *
 * Reports the resolved value upward via onChange:
 *   { ready, address, postcode, keepingExisting }
 * The parent owns the submit; this component owns only the address sub-state.
 */
export function AddressPicker({ existingAddress = "", existingPostcode = "", initialValue, validationErrorId, onChange }) {
  // Capture the parent's resolved value on mount. It changes as we report edits
  // upward, but must only initialise the picker, including after a step change.
  const [initial] = useState(() => initialValue);
  const trimmedExisting = initial?.address?.trim() || existingAddress?.trim() || "";
  const onboarding = useCustomerOnboardingActions();
  const [editing, setEditing] = useState(initial?.address ? !initial.keepingExisting : !trimmedExisting);

  const [postcode, setPostcode] = useState("");
  const [normalisedPostcode, setNormalisedPostcode] = useState("");
  // idle | searching | results | none | invalid | error
  const [lookupStatus, setLookupStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState("");
  const [lookupError, setLookupError] = useState(null);

  const [manualMode, setManualMode] = useState(Boolean(initial?.address && !initial.keepingExisting));
  const [manualAddress, setManualAddress] = useState(initial?.address || "");
  const [manualPostcode, setManualPostcode] = useState(initial?.postcode || existingPostcode || "");

  const keepingExisting = Boolean(trimmedExisting) && !editing;
  const pickedReady =
    lookupStatus === "results" &&
    selectedIndex !== "" &&
    Boolean(results[Number(selectedIndex)]);
  const manualReady = manualMode && manualAddress.trim() !== "";
  // "invalid" counts as the lookup letting the customer down too: a postcode
  // the checker rejects (a typo, a partial code, a brand-new estate) left them
  // with only a small text link, and customers gave up there and messaged in
  // ("it's not letting me put my post code in").
  const lookupFailed =
    lookupStatus === "none" || lookupStatus === "error" || lookupStatus === "invalid";
  const ready = keepingExisting || manualReady || pickedReady;

  // Report the resolved address upward whenever it changes.
  useEffect(() => {
    let address = null;
    let resolvedPostcode = null;
    if (keepingExisting) {
      address = trimmedExisting;
      resolvedPostcode = initial?.postcode || existingPostcode || null;
    } else if (manualMode) {
      address = manualAddress.trim() || null;
      resolvedPostcode = manualPostcode.trim() ? manualPostcode.trim().toUpperCase() : null;
    } else if (pickedReady) {
      const sel = results[Number(selectedIndex)];
      address = sel.line;
      resolvedPostcode = sel.postcode || normalisedPostcode || null;
    }
    onChange?.({ ready, address, postcode: resolvedPostcode, keepingExisting });
    // onChange is intentionally omitted from deps — parents pass an inline
    // callback; including it would re-fire every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    keepingExisting,
    manualMode,
    manualAddress,
    manualPostcode,
    pickedReady,
    selectedIndex,
    results,
    normalisedPostcode,
    trimmedExisting,
    initial,
    existingPostcode,
  ]);

  async function findAddresses() {
    const pc = postcode.trim();
    if (!pc) return;
    setLookupError(null);
    setResults([]);
    setSelectedIndex("");
    setLookupStatus("searching");
    try {
      const { data, error: fnErr } = await onboarding.lookupPostcode(pc);
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
          setLookupError("Too many lookups just now — please wait a moment and try again.");
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

  function enterManual() {
    // Carry the postcode the customer already typed into manual entry so they
    // don't have to re-key it — common when their flat/new-build isn't in PAF.
    const carried = (normalisedPostcode || postcode).trim();
    if (carried && !manualPostcode.trim()) setManualPostcode(carried.toUpperCase());
    setManualMode(true);
    setLookupStatus("idle");
    setResults([]);
    setSelectedIndex("");
  }

  if (keepingExisting) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 text-sm text-[var(--sd-navy)]">
          {trimmedExisting}
          <button
            type="button"
            className="block mt-1 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer"
            onClick={() => setEditing(true)}
          >
            Update address
          </button>
        </div>
      </div>
    );
  }

  if (manualMode) {
    return (
      <>
        <textarea
          aria-label="Full address"
          aria-required="true"
          aria-invalid={Boolean(validationErrorId)}
          aria-describedby={validationErrorId}
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
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          aria-label="Postcode"
          autoComplete="postal-code"
          value={postcode}
          aria-invalid={Boolean(validationErrorId)}
          aria-describedby={validationErrorId}
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
        <>
          <select
            aria-label="Select your address"
            aria-required="true"
            aria-invalid={Boolean(validationErrorId)}
            aria-describedby={validationErrorId}
            value={selectedIndex}
            onChange={(e) => {
              // Flats, sub-divided houses and new builds aren't always in the
              // Royal Mail data, so offer a one-tap route to manual entry that
              // keeps the postcode they've already typed.
              if (e.target.value === "__manual__") {
                enterManual();
                return;
              }
              setSelectedIndex(e.target.value);
            }}
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
            <option value="__manual__">My address isn&apos;t listed — enter it manually</option>
          </select>
          <p className="text-[12px] text-slate-400 mt-1">
            Flats and brand-new builds sometimes don&apos;t show up — if yours
            isn&apos;t here, you can enter it manually.
          </p>
        </>
      )}

      {lookupStatus === "invalid" && (
        <p className="text-[13px] text-brand-coral mt-1.5">
          That doesn&apos;t look like a full UK postcode. Check it and try again,
          or enter your address manually below.
        </p>
      )}
      {lookupStatus === "none" && (
        <p className="text-[13px] text-brand-coral mt-1.5">
          No addresses found for that postcode.
        </p>
      )}
      {lookupStatus === "error" && (
        <p className="text-[13px] text-brand-coral mt-1.5">
          {lookupError || "Couldn't search just now — please try again, or enter your address manually."}
        </p>
      )}

      {lookupFailed ? (
        // The lookup has already let the customer down, so the way forward
        // must be a real button under the message, not a text link they can
        // miss. Customers have stalled here and messaged in to ask for help.
        <button
          type="button"
          className="portal-btn portal-btn--secondary portal-btn--small mt-2"
          onClick={enterManual}
        >
          Enter it manually instead
        </button>
      ) : (
        <button
          type="button"
          className="block mt-2 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer"
          onClick={enterManual}
        >
          Can&apos;t find your address? Enter it manually
        </button>
      )}
    </>
  );
}
