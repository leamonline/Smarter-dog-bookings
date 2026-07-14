import { useEffect, useState } from "react";
import { Card, CardHead, CardBody, SettingRow, Toggle, InlineField, useAutosaveStatus, SaveStatus, INPUT_CLS, SECTION_LABEL_CLS } from "./shared.jsx";

const EMPTY_BANK = { accountName: "", sortCode: "", accountNumber: "" };

export function BookingRulesSettings({ config, onUpdateConfig, canEdit = true }) {
  const { save, status } = useAutosaveStatus(onUpdateConfig, { canEdit });

  // Per-field validation errors keyed by config field. A field with an entry
  // here shows InlineField's `error` (aria-invalid + role=alert) and is not saved.
  const [errors, setErrors] = useState({});

  // Surface invalid numeric input instead of silently clamping it: a blank or
  // negative value sets a visible error and skips the save; a valid value
  // clears the error and persists the parsed number.
  const updateNumericField = (field, raw) => {
    const trimmed = String(raw).trim();
    const num = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(num) || num < 0) {
      setErrors((prev) => ({ ...prev, [field]: "Enter 0 or more" }));
      return;
    }
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    save((prev) => ({ ...prev, [field]: num }));
  };

  const updateConfigField = (field, value) => {
    save((prev) => ({ ...prev, [field]: value }));
  };

  // Deposit bank details: local state while typing, persisted on blur so we
  // don't autosave per keystroke. Re-syncs when the loaded config arrives.
  const [bank, setBank] = useState(config?.depositBank ?? EMPTY_BANK);
  useEffect(() => {
    setBank(config?.depositBank ?? EMPTY_BANK);
  }, [config?.depositBank]);

  const saveBank = () => {
    save((prev) => ({ ...prev, depositBank: { ...EMPTY_BANK, ...bank } }));
  };

  const bankField = (key, label, placeholder) => (
    <label className="block flex-1 min-w-[140px]">
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      <input
        type="text"
        value={bank?.[key] ?? ""}
        placeholder={placeholder}
        disabled={!canEdit}
        onChange={(e) => setBank((b) => ({ ...EMPTY_BANK, ...b, [key]: e.target.value }))}
        onBlur={saveBank}
        aria-label={label}
        className={INPUT_CLS}
      />
    </label>
  );

  return (
    <Card id="settings-rules">
      <CardHead variant="teal" title="Booking Rules" desc="Control how and when customers can book" right={<SaveStatus status={status} />} />
      <CardBody>
        <InlineField
          label="Advance booking window"
          sublabel="How far ahead customers can book"
          suffix="weeks"
          value={config?.advanceBookingWeeks ?? 8}
          onChange={(e) => updateNumericField("advanceBookingWeeks", e.target.value)}
          disabled={!canEdit}
          error={errors.advanceBookingWeeks}
        />
        <InlineField
          label="Minimum cancellation notice"
          sublabel="Hours before appointment a customer can cancel"
          suffix="hours"
          value={config?.minCancellationHours ?? 24}
          onChange={(e) => updateNumericField("minCancellationHours", e.target.value)}
          disabled={!canEdit}
          error={errors.minCancellationHours}
        />
        <InlineField
          label="Default pick-up offset"
          sublabel="Estimated minutes after drop-off for collection"
          suffix="mins"
          value={config?.defaultPickupOffset ?? 120}
          onChange={(e) => updateNumericField("defaultPickupOffset", e.target.value)}
          disabled={!canEdit}
          error={errors.defaultPickupOffset}
        />
        <SettingRow
          label="Auto-confirm bookings"
          sublabel="When off, new bookings need manual approval"
          control={
            <Toggle
              on={config?.autoConfirm !== false}
              onToggle={() => updateConfigField("autoConfirm", !(config?.autoConfirm !== false))}
              disabled={!canEdit}
            />
          }
        />

        {/* Deposits: window + the bank details customers are GIVEN to pay
            into (account name / sort code / account number — not secrets).
            Shown with the payment reference on every deposit booking. */}
        <div className="pt-3.5">
          <div className={SECTION_LABEL_CLS}>Deposits</div>
          <InlineField
            label="Deposit hold window"
            sublabel="Hours an unpaid deposit booking keeps its slot"
            suffix="hours"
            value={config?.depositReleaseHours ?? 12}
            onChange={(e) => updateNumericField("depositReleaseHours", e.target.value)}
            disabled={!canEdit}
            error={errors.depositReleaseHours}
          />
          <div className="py-3.5">
            <div className="text-sm font-semibold text-slate-800">Deposit bank details</div>
            <div className="text-xs text-slate-500 mt-0.5 mb-2.5">
              Customers see these with their payment reference — leave blank to
              share them yourself instead.
            </div>
            <div className="flex flex-wrap gap-2.5">
              {bankField("accountName", "Account name", "Smarter Dog Grooming")}
              {bankField("sortCode", "Sort code", "00-00-00")}
              {bankField("accountNumber", "Account number", "12345678")}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
