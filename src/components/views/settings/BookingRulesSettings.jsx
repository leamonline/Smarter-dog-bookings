import { Card, CardHead, CardBody, SettingRow, Toggle, InlineField, useAutosaveStatus, SaveStatus } from "./shared.jsx";

export function BookingRulesSettings({ config, onUpdateConfig, canEdit = true }) {
  const { save, status } = useAutosaveStatus(onUpdateConfig, { canEdit });

  // Clamp numeric inputs to >= 0 so a typed negative / blank never persists
  // (the InlineField's min={0} only guards the spinner, not typing).
  const toNonNeg = (raw) => Math.max(0, Number(raw) || 0);

  const updatePickupOffset = (value) => {
    save((prev) => ({ ...prev, defaultPickupOffset: toNonNeg(value) }));
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
          onChange={(e) => updateConfigField("advanceBookingWeeks", toNonNeg(e.target.value))}
          disabled={!canEdit}
        />
        <InlineField
          label="Minimum cancellation notice"
          sublabel="Hours before appointment a customer can cancel"
          suffix="hours"
          value={config?.minCancellationHours ?? 24}
          onChange={(e) => updateConfigField("minCancellationHours", toNonNeg(e.target.value))}
          disabled={!canEdit}
        />
        <InlineField
          label="Default pick-up offset"
          sublabel="Estimated minutes after drop-off for collection"
          suffix="mins"
          value={config?.defaultPickupOffset ?? 120}
          onChange={(e) => updatePickupOffset(e.target.value)}
          disabled={!canEdit}
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
