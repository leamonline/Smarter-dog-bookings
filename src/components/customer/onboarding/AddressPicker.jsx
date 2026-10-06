import { useState, useEffect, useRef } from "react";
import { useCustomerOnboardingActions } from "../../../supabase/hooks/useCustomerOnboardingActions";
import { MapPin, Loader2, Search } from "lucide-react";

function postcodeIn(text) {
  const match = text
    .toUpperCase()
    .match(/\b(?:GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b/);
  if (!match) return "";
  const compact = match[0].replace(/\s/g, "");
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}
function SearchAttribution() {
  return (
    <p className="text-[11px] text-slate-400 mt-2">
      Address search:{" "}
      <a
        href="https://www.geoapify.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Geoapify
      </a>
      {" · "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        © OpenStreetMap contributors
      </a>
    </p>
  );
}

/** Shared UK address search with a manual fallback. Only an explicit search
 * calls the server-held Geoapify key; postcode/city-only locations are excluded
 * server-side. Reports { ready, address, postcode, keepingExisting } upward.
 */
export function AddressPicker({
  existingAddress = "",
  existingPostcode = "",
  initialValue,
  validationErrorId,
  onChange,
}) {
  const [initial] = useState(() => initialValue);
  const trimmedExisting =
    initial?.address?.trim() || existingAddress?.trim() || "";
  const onboarding = useCustomerOnboardingActions();
  const [editing, setEditing] = useState(
    initial?.address ? !initial.keepingExisting : !trimmedExisting,
  );
  const [query, setQuery] = useState("");
  const [normalisedPostcode, setNormalisedPostcode] = useState("");
  const [lookupStatus, setLookupStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState("");
  const [lookupError, setLookupError] = useState(null);
  const searchVersion = useRef(0);
  useEffect(
    () => () => {
      searchVersion.current++;
    },
    [],
  );

  const [manualMode, setManualMode] = useState(
    Boolean(initial?.address && !initial.keepingExisting),
  );
  const [manualAddress, setManualAddress] = useState(initial?.address || "");
  const [manualPostcode, setManualPostcode] = useState(
    initial?.postcode || existingPostcode || "",
  );
  const keepingExisting = Boolean(trimmedExisting) && !editing;
  const pickedReady =
    lookupStatus === "results" &&
    selectedIndex !== "" &&
    Boolean(results[Number(selectedIndex)]);
  const manualReady = manualMode && manualAddress.trim() !== "";
  const ready = keepingExisting || manualReady || pickedReady;

  useEffect(() => {
    let address = null;
    let resolvedPostcode = null;
    if (keepingExisting) {
      address = trimmedExisting;
      resolvedPostcode = initial?.postcode || existingPostcode || null;
    } else if (manualMode) {
      address = manualAddress.trim() || null;
      resolvedPostcode = manualPostcode.trim()
        ? manualPostcode.trim().toUpperCase()
        : null;
    } else if (pickedReady) {
      const sel = results[Number(selectedIndex)];
      address = sel.line;
      resolvedPostcode = sel.postcode || normalisedPostcode || null;
    }
    onChange?.({ ready, address, postcode: resolvedPostcode, keepingExisting });
    // Parents may pass an inline callback; it must not trigger a report loop.
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
    const text = query.trim();
    if (lookupStatus === "searching") return;
    if (text.length < 3) {
      setLookupStatus("invalid");
      return;
    }
    const version = ++searchVersion.current;
    setLookupError(null);
    setResults([]);
    setSelectedIndex("");
    setNormalisedPostcode("");
    setLookupStatus("searching");
    try {
      const { data, error: fnErr } = await onboarding.lookupAddress(text);
      if (version !== searchVersion.current) return;
      if (fnErr) {
        let payload = null;
        try {
          payload = await fnErr.context?.json?.();
        } catch {
          /* generic recovery below */
        }
        if (version !== searchVersion.current) return;
        if (
          payload?.error === "invalid_search" ||
          payload?.error === "invalid_postcode"
        ) {
          setLookupStatus("invalid");
          return;
        }
        if (payload?.error === "rate_limited") {
          setLookupError(
            "Too many searches just now — please wait a moment, or enter your address manually.",
          );
        }
        setLookupStatus("error");
        return;
      }
      const addrs = Array.isArray(data?.addresses) ? data.addresses : [];
      setNormalisedPostcode(data?.postcode || "");
      setResults(addrs);
      setLookupStatus(addrs.length ? "results" : "none");
      // Every suggestion needs confirmation, including a single approximate match.
    } catch {
      if (version === searchVersion.current) setLookupStatus("error");
    }
  }
  function resetSearch() {
    searchVersion.current++;
    setLookupStatus("idle");
    setResults([]);
    setSelectedIndex("");
    setNormalisedPostcode("");
    setLookupError(null);
  }
  function enterManual() {
    const carried = normalisedPostcode || postcodeIn(query);
    if (carried && !manualPostcode.trim()) setManualPostcode(carried);
    const compact = query.trim().toUpperCase().replace(/\s/g, "");
    const isPostcodeOnly =
      /^[A-Z]{1,2}\d[A-Z\d]?(?:\d[A-Z]{0,2})?$/.test(compact) ||
      compact === "GIR0AA";
    if (query.trim() && !isPostcodeOnly && !manualAddress.trim())
      setManualAddress(query.trim());
    resetSearch();
    setManualMode(true);
  }

  if (keepingExisting) {
    return (
      <>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <MapPin
            size={16}
            className="text-slate-400 mt-0.5 shrink-0"
            aria-hidden="true"
          />
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
        <SearchAttribution />
      </>
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
            resetSearch();
            setManualMode(false);
          }}
        >
          Search for your address instead
        </button>
        <SearchAttribution />
      </>
    );
  }
  return (
    <div aria-busy={lookupStatus === "searching"}>
      <p className="text-[12px] text-slate-500 mb-1.5">
        Enter your house number or name, street and town.
      </p>
      <div className="flex gap-2">
        <input
          aria-label="Search for your address"
          autoComplete="off"
          value={query}
          maxLength={200}
          aria-invalid={Boolean(validationErrorId)}
          aria-describedby={validationErrorId}
          onChange={(e) => {
            resetSearch();
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              findAddresses();
            }
          }}
          placeholder="e.g. 6 Back Lane, Mottram"
          className="portal-input min-w-0 flex-1"
        />
        <button
          type="button"
          className="portal-btn portal-btn--secondary portal-btn--small whitespace-nowrap"
          onClick={findAddresses}
          disabled={lookupStatus === "searching" || query.trim().length < 3}
        >
          {lookupStatus === "searching" ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />{" "}
              Searching…
            </>
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
              if (e.target.value === "__manual__") enterManual();
              else setSelectedIndex(e.target.value);
            }}
            className="portal-input mt-2.5 w-full"
          >
            <option value="">
              {results.length} suggestion{results.length === 1 ? "" : "s"} —
              select your full address…
            </option>
            {results.map((a, i) => (
              <option key={a.udprn || i} value={String(i)}>
                {a.line}
              </option>
            ))}
            <option value="__manual__">
              My address isn&apos;t listed — enter it manually
            </option>
          </select>
          <p className="text-[12px] text-slate-400 mt-1">
            Check the house number and postcode. Some houses and flats may be
            missing; manual entry is always available.
          </p>
        </>
      )}
      {lookupStatus === "invalid" && (
        <p role="alert" className="text-[13px] text-brand-coral mt-1.5">
          Enter at least three characters of your address, or enter it manually.
        </p>
      )}
      {lookupStatus === "none" && (
        <p role="status" className="text-[13px] text-brand-coral mt-1.5">
          No address suggestions found. Add your house number and street, or
          enter your address manually.
        </p>
      )}
      {lookupStatus === "error" && (
        <p role="alert" className="text-[13px] text-brand-coral mt-1.5">
          {lookupError ||
            "Couldn't search just now — please try again, or enter your address manually."}
        </p>
      )}
      <button
        type="button"
        className="block mt-2 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer"
        onClick={enterManual}
      >
        Can&apos;t find your address? Enter it manually
      </button>
      <SearchAttribution />
    </div>
  );
}
