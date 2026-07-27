import { createDefaultBookingRules } from "../../../constants/salonSettings";
import {
  Card,
  CardHead,
  CardBody,
  SettingRow,
  Toggle,
  useAutosaveStatus,
  SaveStatus,
} from "./shared.jsx";

const NOOP_SAVE = async () => ({ ok: true });

export function CustomerPortalSettings({
  bookingRules,
  onUpdateBookingRules = NOOP_SAVE,
  canEdit = true,
}) {
  const { save, status } = useAutosaveStatus(onUpdateBookingRules, { canEdit });
  const portal =
    bookingRules?.customerPortal ||
    createDefaultBookingRules().customerPortal;

  const togglePortal = (key) => {
    if (!canEdit) return;
    void save({
      customerPortal: {
        [key]: !portal[key],
      },
    });
  };

  return (
    <Card id="settings-portal">
      <CardHead
        variant="teal"
        title="Customer Portal"
        desc="Server-owned controls for customer self-service"
        right={<SaveStatus status={status} />}
      />
      <CardBody>
        <p className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700">
          Upcoming visits are always visible so customers can see and act on
          unresolved bookings.
        </p>
        <SettingRow
          label="Show past booking history"
          sublabel="Customers can view resolved previous appointments"
          control={
            <Toggle
              on={portal.showHistory}
              onToggle={() => togglePortal("showHistory")}
              disabled={!canEdit}
            />
          }
        />
        <SettingRow
          label="Allow repeat booking"
          sublabel="Customers can request another visit from their history"
          control={
            <Toggle
              on={portal.allowRepeatBooking}
              onToggle={() => togglePortal("allowRepeatBooking")}
              disabled={!canEdit}
            />
          }
        />
        <SettingRow
          label="Allow cancellations"
          sublabel="Customers can cancel when the server says the visit is eligible"
          control={
            <Toggle
              on={portal.allowCancellations}
              onToggle={() => togglePortal("allowCancellations")}
              disabled={!canEdit}
            />
          }
        />
        <SettingRow
          label="Allow rescheduling"
          sublabel="Customers can reschedule when the server says the visit is eligible"
          control={
            <Toggle
              on={portal.allowRescheduling}
              onToggle={() => togglePortal("allowRescheduling")}
              disabled={!canEdit}
            />
          }
          border={false}
        />
      </CardBody>
    </Card>
  );
}
