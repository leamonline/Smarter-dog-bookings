import { Card, CardHead, CardBody, SettingRow, Toggle, useAutosaveStatus, SaveStatus } from "./shared.jsx";
import { DEFAULT_CUSTOMER_PORTAL_SETTINGS } from "../../../constants/index";

export function CustomerPortalSettings({ config, onUpdateConfig, canEdit = true }) {
  const { save, status } = useAutosaveStatus(onUpdateConfig, { canEdit });
  const portal = config?.customerPortal || DEFAULT_CUSTOMER_PORTAL_SETTINGS;

  const togglePortal = (key) => {
    if (!canEdit) return;
    save((prev) => ({
      ...prev,
      customerPortal: {
        ...(prev.customerPortal || DEFAULT_CUSTOMER_PORTAL_SETTINGS),
        [key]: !(prev.customerPortal || DEFAULT_CUSTOMER_PORTAL_SETTINGS)[key],
      },
    }));
  };

  return (
    <Card id="settings-portal">
      <CardHead variant="teal" title="Customer Portal" desc="Control what customers can see and do" right={<SaveStatus status={status} />} />
      <CardBody>
        <SettingRow
          label="Show upcoming bookings"
          sublabel="Customers can see their scheduled appointments"
          control={<Toggle on={portal.showUpcoming} onToggle={() => togglePortal("showUpcoming")} disabled={!canEdit} />}
        />
        <SettingRow
          label="Show past booking history"
          sublabel="Customers can view previous appointments"
          control={<Toggle on={portal.showHistory} onToggle={() => togglePortal("showHistory")} disabled={!canEdit} />}
        />
        <SettingRow
          label="Allow rebooking"
          sublabel="Customers can rebook a previous service directly"
          control={<Toggle on={portal.allowRebooking} onToggle={() => togglePortal("allowRebooking")} disabled={!canEdit} />}
        />
        <SettingRow
          label="Allow cancellations"
          sublabel="Customers can cancel within the notice window"
          control={<Toggle on={portal.allowCancellations} onToggle={() => togglePortal("allowCancellations")} disabled={!canEdit} />}
          border={false}
        />
      </CardBody>
    </Card>
  );
}
