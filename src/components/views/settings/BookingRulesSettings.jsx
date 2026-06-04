import { Card, CardHead, CardBody, SettingRow, Toggle, InlineField, useConfigSaver } from "./shared.jsx";

export function BookingRulesSettings({ config, onUpdateConfig, canEdit = true }) {
  const save = useConfigSaver(onUpdateConfig, { canEdit });

  const updatePickupOffset = (value) => {
    save((prev) => ({ ...prev, defaultPickupOffset: Number(value) }));
  };

  const updateConfigField = (field, value) => {
    save((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card id="settings-rules">
      <CardHead variant="teal" title="Booking Rules" desc="Control how and when customers can book" />
      <CardBody>
        <InlineField
          label="Advance booking window"
          sublabel="How far ahead customers can book"
          suffix="weeks"
          value={config?.advanceBookingWeeks ?? 8}
          onChange={(e) => updateConfigField("advanceBookingWeeks", Number(e.target.value))}
          disabled={!canEdit}
        />
        <InlineField
          label="Minimum cancellation notice"
          sublabel="Hours before appointment a customer can cancel"
          suffix="hours"
          value={config?.minCancellationHours ?? 24}
          onChange={(e) => updateConfigField("minCancellationHours", Number(e.target.value))}
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
