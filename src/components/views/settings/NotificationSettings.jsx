import { Card, CardHead, CardBody, Toggle, useConfigSaver } from "./shared.jsx";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../../../constants/index.js";

const ALL_CHANNELS = ["whatsapp", "email", "sms"];

const CHANNEL_STYLES = {
  whatsapp: { bg: "#DCFCE7", color: "#16A34A", label: "WhatsApp" },
  email: { bg: "#E0F7FC", color: "#0284C7", label: "Email" },
  sms: { bg: "#FFF8E0", color: "#92400E", label: "SMS" },
};

const NOTIF_ROWS = [
  { key: "bookingConfirmation", label: "Booking confirmation", sub: "Sent immediately when a booking is made" },
  { key: "dayBeforeReminder", label: "Day-before reminder", sub: "Sent the evening before the appointment" },
  { key: "readyForCollection", label: "Ready for collection", sub: "Notify owner when their dog is finished" },
  { key: "followUp", label: "Follow-up / review request", sub: "Sent 24 hours after the appointment" },
];

export function NotificationSettings({ config, onUpdateConfig, canEdit = true }) {
  const save = useConfigSaver(onUpdateConfig, { canEdit });
  const notifs = config?.notifications || DEFAULT_NOTIFICATION_SETTINGS;

  const toggleNotif = (key) => {
    if (!canEdit) return;
    const current = notifs[key];
    save((prev) => ({
      ...prev,
      notifications: {
        ...(prev.notifications || DEFAULT_NOTIFICATION_SETTINGS),
        [key]: { ...current, enabled: !current.enabled },
      },
    }));
  };

  const toggleNotifChannel = (notifKey, channel) => {
    if (!canEdit) return;
    const current = notifs[notifKey] || { enabled: false, channels: [] };
    const channels = current.channels || [];
    const updated = channels.includes(channel)
      ? channels.filter((c) => c !== channel)
      : [...channels, channel];
    save((prev) => ({
      ...prev,
      notifications: {
        ...(prev.notifications || DEFAULT_NOTIFICATION_SETTINGS),
        [notifKey]: { ...current, channels: updated },
      },
    }));
  };

  return (
    <Card id="settings-notifs">
      <CardHead variant="yellow" title="Notifications" desc="What gets sent to customers and via which channel" />
      <CardBody>
        {NOTIF_ROWS.map((row, idx) => {
          const n = notifs[row.key] || { enabled: false, channels: [] };
          const activeChannels = n.channels || [];
          return (
            <div
              key={row.key}
              className={`py-3.5 ${idx < NOTIF_ROWS.length - 1 ? "border-b border-slate-200" : ""}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{row.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{row.sub}</div>
                </div>
                <Toggle on={n.enabled} onToggle={() => toggleNotif(row.key)} disabled={!canEdit} />
              </div>
              {/* Channel badges */}
              <div className="flex gap-1.5 mt-2">
                {ALL_CHANNELS.map((ch) => {
                  const s = CHANNEL_STYLES[ch];
                  const isActive = activeChannels.includes(ch);
                  return (
                    <span
                      key={ch}
                      onClick={() => toggleNotifChannel(row.key, ch)}
                      className={`text-micro font-bold px-2.5 py-1 rounded-lg uppercase tracking-tight motion-safe:transition-all select-none ${
                        canEdit && n.enabled
                          ? "cursor-pointer opacity-100"
                          : "cursor-not-allowed opacity-40 pointer-events-none"
                      }`}
                      style={{
                        background: isActive ? s.bg : "#F1F3F5",
                        color: isActive ? s.color : "#9CA3AF",
                        border: isActive ? `1.5px solid ${s.color}` : "1.5px solid transparent",
                      }}
                    >
                      {s.label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
