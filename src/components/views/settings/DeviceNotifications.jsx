import { useToast } from "../../../contexts/ToastContext.jsx";
import { useStaffPush } from "../../../hooks/useStaffPush";
import { Card, CardHead, CardBody, SettingRow, Toggle } from "./shared.jsx";

// Per-staff, per-device push notification controls. Additive: a staff member
// who never enables this sees no change, and customers never see it at all
// (staff app only).
const CATEGORIES = [
  { key: "messages", label: "New messages", sub: "Inbound WhatsApp / SMS" },
  { key: "newBooking", label: "New bookings", sub: "A booking is made" },
  { key: "cancellation", label: "Cancellations", sub: "A booking is cancelled" },
  { key: "reschedule", label: "Reschedules", sub: "A booking is moved" },
  { key: "newClient", label: "New client signups", sub: "Join the Pack — needs review" },
  { key: "waitlist", label: "Waitlist joins", sub: "Someone joins the waitlist" },
];

function Notice({ children }) {
  return (
    <div className="text-[13px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3 leading-relaxed">
      {children}
    </div>
  );
}

export function DeviceNotifications({ user }) {
  const toast = useToast();
  const push = useStaffPush(user?.id);

  const handleEnable = async () => {
    const ok = await push.subscribe();
    toast.show(
      ok ? "Notifications enabled on this device" : "Couldn't enable notifications",
      ok ? "success" : "error",
    );
  };

  const handleDisable = async () => {
    const ok = await push.unsubscribe();
    toast.show(
      ok ? "Notifications disabled on this device" : "Couldn't disable notifications",
      ok ? "success" : "error",
    );
  };

  const handleToggle = async (key, value) => {
    const ok = await push.setPref(key, value);
    if (!ok) toast.show("Couldn't save that change", "error");
  };

  let content;
  if (!push.isSupported) {
    content = (
      <Notice>
        This browser doesn't support notifications. On iPhone or iPad, open the
        salon app in Safari, then add it to your Home Screen and open it from
        there.
      </Notice>
    );
  } else if (!push.isStandalone) {
    content = (
      <Notice>
        <strong>Add the app to your Home Screen first.</strong> In Safari tap the
        Share button, choose <em>Add to Home Screen</em>, then open the salon app
        from your Home Screen and come back here to enable notifications.
        Notifications don't work in a normal browser tab.
      </Notice>
    );
  } else if (!push.vapidConfigured) {
    content = (
      <Notice>
        Push notifications aren't configured for this deployment yet. Once the
        VAPID key is set, this option will appear.
      </Notice>
    );
  } else if (push.permission === "denied") {
    content = (
      <Notice>
        Notifications are blocked for this app. To turn them on, open iOS
        Settings → Notifications → Smarter Dog and allow notifications, then
        re-open the app.
      </Notice>
    );
  } else if (!push.isSubscribed) {
    content = (
      <div>
        <div className="text-[13px] text-slate-600 mb-3 leading-relaxed">
          Get a push to this device when a booking, message, cancellation,
          signup or waitlist join comes in.
        </div>
        <button
          type="button"
          onClick={handleEnable}
          disabled={push.busy}
          className={`px-[18px] py-[9px] rounded-control border text-[13px] font-bold font-inherit transition-all ${
            push.busy
              ? "bg-white text-slate-500 border-slate-200 cursor-default"
              : "bg-brand-teal text-white border-brand-teal cursor-pointer hover:opacity-90"
          }`}
        >
          {push.busy ? "Enabling…" : "Enable notifications"}
        </button>
      </div>
    );
  } else {
    content = (
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[13px] text-brand-teal font-semibold">
            ✓ Enabled on this device
          </div>
          <button
            type="button"
            onClick={handleDisable}
            disabled={push.busy}
            className="text-[13px] font-semibold text-brand-coral hover:underline disabled:opacity-60 disabled:cursor-default bg-transparent border-none cursor-pointer p-0"
          >
            {push.busy ? "Working…" : "Disable"}
          </button>
        </div>
        <div className="mt-1">
          {CATEGORIES.map((c, i) => (
            <SettingRow
              key={c.key}
              label={c.label}
              sublabel={c.sub}
              border={i < CATEGORIES.length - 1}
              control={
                <Toggle
                  on={push.prefs[c.key]}
                  onToggle={() => handleToggle(c.key, !push.prefs[c.key])}
                />
              }
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card id="settings-device-notifications">
      <CardHead
        variant="teal"
        title="Device notifications"
        desc="Push alerts to this phone or tablet (staff only)"
      />
      <CardBody>{content}</CardBody>
    </Card>
  );
}
