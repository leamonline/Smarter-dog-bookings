// src/components/views/SettingsView.jsx — thin shell with tab navigation
import { BusinessSettings } from "./settings/BusinessSettings.jsx";
import { HoursSettings } from "./settings/HoursSettings.jsx";
import { AccountSettings } from "./settings/AccountSettings.jsx";
import { PricingSettings } from "./settings/PricingSettings.jsx";
import { BookingRulesSettings } from "./settings/BookingRulesSettings.jsx";
import { CapacitySettings } from "./settings/CapacitySettings.jsx";
import { CustomerPortalSettings } from "./settings/CustomerPortalSettings.jsx";
import { NotificationSettings } from "./settings/NotificationSettings.jsx";

const SECTIONS = [
  { id: "business", label: "Your Business" },
  { id: "hours", label: "Hours & Closures" },
  { id: "account", label: "Your Account" },
  { id: "pricing", label: "Services & Pricing" },
  { id: "rules", label: "Booking Rules" },
  { id: "capacity", label: "Capacity Engine" },
  { id: "portal", label: "Customer Portal" },
  { id: "notifs", label: "Notifications" },
];

function JumpBar() {
  const scrollTo = (id) => {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-[10px] mb-5">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className="rounded-[7px] px-3 py-[7px] text-xs font-semibold cursor-pointer font-inherit transition-all border-none bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsView({ config, onUpdateConfig, user, staffProfile }) {
  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Page header */}
      <div className="mb-5">
        <h2 className="text-2xl font-extrabold m-0 text-slate-800">Salon Settings</h2>
        <div className="text-[13px] text-slate-500 mt-1">
          Manage your business, pricing, booking rules, and more.
        </div>
      </div>

      <JumpBar />

      <BusinessSettings config={config} onUpdateConfig={onUpdateConfig} />
      <HoursSettings config={config} onUpdateConfig={onUpdateConfig} />
      <AccountSettings user={user} staffProfile={staffProfile} />
      <PricingSettings config={config} onUpdateConfig={onUpdateConfig} />
      <BookingRulesSettings config={config} onUpdateConfig={onUpdateConfig} />
      <CapacitySettings config={config} onUpdateConfig={onUpdateConfig} />
      <CustomerPortalSettings config={config} onUpdateConfig={onUpdateConfig} />
      <NotificationSettings config={config} onUpdateConfig={onUpdateConfig} />
    </div>
  );
}
