import { Card, CardHead, CardBody, SettingRow, Toggle, InlineField } from "./shared.jsx";

export function BookingRulesSettings({ config, onUpdateConfig }) {
  const updatePickupOffset = (value) => {
    onUpdateConfig((prev) => ({ ...prev, defaultPickupOffset: Number(value) }));
  };

  const updateConfigField = (field, value) => {
    onUpdateConfig((prev) => ({ ...prev, [field]: value }));
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
        />
        <InlineField
          label="Minimum cancellation notice"
          sublabel="Hours before appointment a customer can cancel"
          suffix="hours"
          value={config?.minCancellationHours ?? 24}
          onChange={(e) => updateConfigField("minCancellationHours", Number(e.target.value))}
        />
        <InlineField
          label="Default pick-up offset"
          sublabel="Estimated minutes after drop-off for collection"
          suffix="mins"
          value={config?.defaultPickupOffset ?? 120}
          onChange={(e) => updatePickupOffset(e.target.value)}
        />
        <SettingRow
          label="Auto-confirm bookings"
          sublabel="When off, new bookings need manual approval"
          control={
            <Toggle
              on={config?.autoConfirm !== false}
              onToggle={() => updateConfigField("autoConfirm", !(config?.autoConfirm !== false))}
            />
          }
          border={false}
        />
      </CardBody>
    </Card>
  );
}
