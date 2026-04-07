import { Card, CardHead, CardBody, SettingRow, Toggle } from "./shared.jsx";

const DEFAULT_PORTAL = {
  showUpcoming: true,
  showHistory: true,
  allowRebooking: false,
  allowCancellations: true,
};

export function CustomerPortalSettings({ config, onUpdateConfig }) {
  const portal = config?.customerPortal || DEFAULT_PORTAL;

  const togglePortal = (key) => {
    onUpdateConfig((prev) => ({
      ...prev,
      customerPortal: { ...(prev.customerPortal || DEFAULT_PORTAL), [key]: !(prev.customerPortal || DEFAULT_PORTAL)[key] },
    }));
  };

  return (
    <Card id="settings-portal">
      <CardHead variant="teal" title="Customer Portal" desc="Control what customers can see and do" />
      <CardBody>
        <SettingRow
          label="Show upcoming bookings"
          sublabel="Customers can see their scheduled appointments"
          control={<Toggle on={portal.showUpcoming} onToggle={() => togglePortal("showUpcoming")} />}
        />
        <SettingRow
          label="Show past booking history"
          sublabel="Customers can view previous appointments"
          control={<Toggle on={portal.showHistory} onToggle={() => togglePortal("showHistory")} />}
        />
        <SettingRow
          label="Allow rebooking"
          sublabel="Customers can rebook a previous service directly"
          control={<Toggle on={portal.allowRebooking} onToggle={() => togglePortal("allowRebooking")} />}
        />
        <SettingRow
          label="Allow cancellations"
          sublabel="Customers can cancel within the notice window"
          control={<Toggle on={portal.allowCancellations} onToggle={() => togglePortal("allowCancellations")} />}
          border={false}
        />
      </CardBody>
    </Card>
  );
}
