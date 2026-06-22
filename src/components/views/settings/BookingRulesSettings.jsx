import { useState } from "react";
import { Card, CardHead, CardBody, SettingRow, Toggle, InlineField, useAutosaveStatus, SaveStatus } from "./shared.jsx";

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
          border={false}
        />
      </CardBody>
    </Card>
  );
}
