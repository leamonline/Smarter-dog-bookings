import { useEffect, useState } from "react";
import {
  BOOKING_DEPOSIT_HOLD_HOURS,
  createDefaultBookingRules,
} from "../../../constants/salonSettings";
import {
  Card,
  CardHead,
  CardBody,
  SettingRow,
  Toggle,
  InlineField,
  useAutosaveStatus,
  SaveStatus,
  INPUT_CLS,
  SECTION_LABEL_CLS,
} from "./shared.jsx";

const NOOP_SAVE = async () => ({ ok: true });
const DEFAULT_BOOKING_RULES = createDefaultBookingRules();

function isCompleteBank(bank) {
  return (
    bank.accountName.trim().length > 0 &&
    /^[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(bank.sortCode) &&
    /^[0-9]{8}$/.test(bank.accountNumber)
  );
}

function hasPublishedTerms(rules) {
  return Boolean(
    rules.depositTermsVersion && rules.depositTermsContentHash,
  );
}

function readinessWarning(rules) {
  const missing = [];
  if (!isCompleteBank(rules.depositBank)) missing.push("complete bank details");
  if (!hasPublishedTerms(rules)) missing.push("a Terms publication");
  if (missing.length === 0) return null;
  return `Deposit-dependent bookings are blocked from using this policy until ${missing.join(" and ")} are saved.`;
}

function field(label, value, onChange, options = {}) {
  return (
    <label className={options.className || "block flex-1 min-w-[180px]"}>
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      <input
        type={options.type || "text"}
        value={value}
        placeholder={options.placeholder}
        disabled={options.disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        spellCheck={options.spellCheck}
        autoCapitalize={options.autoCapitalize}
        className={INPUT_CLS}
      />
    </label>
  );
}

export function BookingRulesSettings({
  config,
  bookingRules,
  bookingPolicyRuntime,
  bookingPolicyLoading = false,
  bookingPolicyError = null,
  onUpdateConfig = NOOP_SAVE,
  onUpdateBookingRules = NOOP_SAVE,
  canEdit = true,
}) {
  const rules = bookingRules || DEFAULT_BOOKING_RULES;
  const runtime = bookingPolicyRuntime || {
    state: "inactive",
    scheduledEffectiveAt: null,
  };
  const { save: saveRules, status: rulesStatus } = useAutosaveStatus(
    onUpdateBookingRules,
    { canEdit },
  );
  const { save: saveLegacy, status: legacyStatus } = useAutosaveStatus(
    onUpdateConfig,
    { canEdit },
  );
  const [formError, setFormError] = useState(null);
  const [horizon, setHorizon] = useState(String(rules.bookingHorizonDays));
  const [bank, setBank] = useState(rules.depositBank);
  const [terms, setTerms] = useState({
    termsUrl: rules.termsUrl,
    version: rules.depositTermsVersion || "",
    hash: rules.depositTermsContentHash || "",
  });

  useEffect(() => {
    setHorizon(String(rules.bookingHorizonDays));
  }, [rules.bookingHorizonDays]);
  useEffect(() => {
    setBank(rules.depositBank);
  }, [rules.depositBank]);
  useEffect(() => {
    setTerms({
      termsUrl: rules.termsUrl,
      version: rules.depositTermsVersion || "",
      hash: rules.depositTermsContentHash || "",
    });
  }, [
    rules.termsUrl,
    rules.depositTermsVersion,
    rules.depositTermsContentHash,
  ]);

  const updateLegacyNumericField = (fieldName, raw) => {
    const trimmed = String(raw).trim();
    const value = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(value) || value < 0) {
      setFormError("Enter 0 or more.");
      return;
    }
    setFormError(null);
    void saveLegacy((previous) => ({ ...previous, [fieldName]: value }));
  };

  const saveHorizon = async () => {
    const trimmed = horizon.trim();
    const value = Number(trimmed);
    if (
      !/^[0-9]+$/.test(trimmed) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 730
    ) {
      setFormError("Enter a whole number from 1 to 730.");
      return;
    }
    setFormError(null);
    const result = await saveRules({ bookingHorizonDays: value });
    if (result?.ok === false) {
      setHorizon(String(rules.bookingHorizonDays));
      setFormError(result.error);
    }
  };

  const saveBank = async () => {
    const trimmed = {
      accountName: bank.accountName.trim(),
      sortCode: bank.sortCode.trim(),
      accountNumber: bank.accountNumber.trim(),
    };
    const presentCount = Object.values(trimmed).filter(Boolean).length;
    if (presentCount !== 0 && presentCount !== 3) {
      setFormError("Enter all three bank details or clear all three.");
      return;
    }
    if (
      presentCount === 3 &&
      (!/^[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(trimmed.sortCode) ||
        !/^[0-9]{8}$/.test(trimmed.accountNumber))
    ) {
      setFormError(
        "Use a sort code like 00-00-00 and an 8-digit account number.",
      );
      return;
    }
    setFormError(null);
    const result = await saveRules({ depositBank: trimmed });
    if (result?.ok === false) {
      setBank(rules.depositBank);
      setFormError(result.error);
    }
  };

  const saveTerms = async () => {
    const termsUrl = terms.termsUrl.trim();
    const version = terms.version.trim();
    const hash = terms.hash.trim();
    const hasVersion = version.length > 0;
    const hasHash = hash.length > 0;
    const validHttpsUrl = (() => {
      try {
        const parsed = new URL(termsUrl);
        return (
          parsed.protocol === "https:" &&
          !parsed.username &&
          !parsed.password
        );
      } catch {
        return false;
      }
    })();
    if (!validHttpsUrl) {
      setFormError("Enter a valid HTTPS Terms URL.");
      return;
    }
    if (hasVersion !== hasHash) {
      setFormError(
        "Enter the version and lowercase SHA-256 hash together, or clear both.",
      );
      return;
    }
    if (hasHash && !/^[0-9a-f]{64}$/.test(hash)) {
      setFormError(
        "The deposit Terms SHA-256 hash must be 64 lowercase hexadecimal characters.",
      );
      return;
    }
    setFormError(null);
    const result = await saveRules({
      termsUrl,
      depositTermsVersion: hasVersion ? version : null,
      depositTermsContentHash: hasHash ? hash : null,
    });
    if (result?.ok === false) {
      setTerms({
        termsUrl: rules.termsUrl,
        version: rules.depositTermsVersion || "",
        hash: rules.depositTermsContentHash || "",
      });
      setFormError(result.error);
    }
  };

  const isUpcoming = runtime.state !== "active";
  const scheduledText =
    runtime.state === "scheduled" && runtime.scheduledEffectiveAt
      ? `Scheduled for ${new Date(runtime.scheduledEffectiveAt).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/London",
        })}`
      : runtime.state === "failed"
        ? "Activation needs attention"
        : runtime.state === "inactive"
          ? "Not scheduled"
          : "Active";
  const visibleAlert =
    formError || bookingPolicyError || readinessWarning(rules);

  return (
    <Card id="settings-rules">
      <CardHead
        variant="teal"
        title="Booking Rules"
        desc="Server-owned rules for customer bookings"
        right={<SaveStatus status={rulesStatus} />}
      />
      <CardBody>
        {runtime.state !== "active" && (
          <>
            <div className={SECTION_LABEL_CLS}>Current booking setup</div>
            <InlineField
              label="Default pick-up offset"
              sublabel="Estimated minutes after drop-off for collection"
              suffix="mins"
              value={config?.defaultPickupOffset ?? 120}
              onChange={(event) =>
                updateLegacyNumericField(
                  "defaultPickupOffset",
                  event.target.value,
                )
              }
              disabled={!canEdit}
            />
            <div className="flex justify-end pt-1">
              <SaveStatus status={legacyStatus} />
            </div>
          </>
        )}

        <section
          aria-labelledby="booking-policy-section"
          className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div
                id="booking-policy-section"
                className={SECTION_LABEL_CLS}
              >
                {isUpcoming ? "Upcoming policy" : "Current policy"}
              </div>
              <div className="text-sm font-bold text-slate-800">
                previous_day_1500_v1
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Customer changes close at 3:00 pm on the previous calendar
                day.
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
              {scheduledText}
            </span>
          </div>

          {bookingPolicyLoading ? (
            <p role="status" className="mt-4 text-sm text-slate-600">
              Loading booking policy…
            </p>
          ) : (
            <>
              {visibleAlert && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900"
                >
                  {visibleAlert}
                </div>
              )}

              <div className="mt-4 border-t border-slate-200">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      Booking horizon
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Furthest date the server will offer
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      aria-label="Booking horizon"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="730"
                      step="1"
                      value={horizon}
                      disabled={!canEdit}
                      onChange={(event) => setHorizon(event.target.value)}
                      onBlur={saveHorizon}
                      className="w-24 rounded-lg border-[1.5px] border-slate-200 px-3 py-2 text-right text-body outline-none focus:border-brand-teal disabled:bg-slate-50"
                    />
                    <span className="text-body text-slate-500">days</span>
                  </div>
                </div>

                <SettingRow
                  label="Auto-confirm bookings"
                  sublabel="When off, new bookings need manual approval"
                  control={
                    <Toggle
                      on={rules.autoConfirm}
                      onToggle={() =>
                        void saveRules({ autoConfirm: !rules.autoConfirm })
                      }
                      disabled={!canEdit}
                    />
                  }
                />

                <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      Deposit hold window
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      How long an unpaid deposit booking keeps its slot
                    </div>
                  </div>
                  <select
                    aria-label="Deposit hold window"
                    value={rules.depositHoldHours}
                    disabled={!canEdit}
                    onChange={(event) =>
                      void saveRules({
                        depositHoldHours: Number(event.target.value),
                      })
                    }
                    className="rounded-lg border-[1.5px] border-slate-200 bg-white px-3 py-2 text-body outline-none focus:border-brand-teal disabled:bg-slate-50"
                  >
                    {BOOKING_DEPOSIT_HOLD_HOURS.map((hours) => (
                      <option key={hours} value={hours}>
                        {hours} hours
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="py-4">
                <div className="text-sm font-semibold text-slate-800">
                  Deposit bank details
                </div>
                <p className="mb-2.5 mt-0.5 text-xs text-slate-500">
                  Save all three fields together, or clear all three.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {field(
                    "Account name",
                    bank.accountName,
                    (value) => setBank((current) => ({ ...current, accountName: value })),
                    {
                      placeholder: "Smarter Dog Grooming",
                      disabled: !canEdit,
                    },
                  )}
                  {field(
                    "Sort code",
                    bank.sortCode,
                    (value) => setBank((current) => ({ ...current, sortCode: value })),
                    { placeholder: "00-00-00", disabled: !canEdit },
                  )}
                  {field(
                    "Account number",
                    bank.accountNumber,
                    (value) =>
                      setBank((current) => ({ ...current, accountNumber: value })),
                    { placeholder: "12345678", disabled: !canEdit },
                  )}
                </div>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={saveBank}
                  className="mt-3 rounded-control bg-brand-teal px-4 py-2.5 text-body font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  Save bank details
                </button>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="text-sm font-semibold text-slate-800">
                  Terms publication
                </div>
                <p className="mb-2.5 mt-0.5 text-xs text-slate-500">
                  Saving a version and hash records an immutable publication.
                  Clear both fields together to remove the current selection
                  while the policy is inactive.
                </p>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {field(
                    "Terms URL",
                    terms.termsUrl,
                    (value) => setTerms((current) => ({ ...current, termsUrl: value })),
                    {
                      type: "url",
                      className: "block md:col-span-2",
                      disabled: !canEdit,
                    },
                  )}
                  {field(
                    "Deposit Terms version",
                    terms.version,
                    (value) => setTerms((current) => ({ ...current, version: value })),
                    { placeholder: "2026-07 v1", disabled: !canEdit },
                  )}
                  {field(
                    "Deposit Terms SHA-256",
                    terms.hash,
                    (value) => setTerms((current) => ({ ...current, hash: value })),
                    {
                      placeholder: "64 lowercase hexadecimal characters",
                      disabled: !canEdit,
                      spellCheck: false,
                      autoCapitalize: "none",
                    },
                  )}
                </div>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={saveTerms}
                  className="mt-3 rounded-control bg-brand-teal px-4 py-2.5 text-body font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  Save Terms settings
                </button>
              </div>
            </>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
