// src/components/views/SettingsView.jsx — tabbed settings interface
import { useState, useRef, useEffect } from "react";
import { BusinessSettings } from "./settings/BusinessSettings.jsx";
import { HoursSettings } from "./settings/HoursSettings.jsx";
import { AccountSettings } from "./settings/AccountSettings.jsx";
import { PricingSettings } from "./settings/PricingSettings.jsx";
import { BookingRulesSettings } from "./settings/BookingRulesSettings.jsx";
import { CapacitySettings } from "./settings/CapacitySettings.jsx";
import { CustomerPortalSettings } from "./settings/CustomerPortalSettings.jsx";
import { NotificationSettings } from "./settings/NotificationSettings.jsx";
import { CalendarSettings } from "./settings/CalendarSettings.jsx";

const SECTIONS = [
  { id: "business", label: "Your Business" },
  { id: "hours", label: "Hours & Closures" },
  { id: "account", label: "Your Account" },
  { id: "pricing", label: "Services & Pricing" },
  { id: "rules", label: "Booking Rules" },
  { id: "capacity", label: "Capacity Engine" },
  { id: "portal", label: "Customer Portal" },
  { id: "notifs", label: "Notifications" },
  { id: "calendar", label: "Calendar Sync" },
];

export function SettingsView({ config, onUpdateConfig, user, staffProfile }) {
  const [activeTab, setActiveTab] = useState("business");
  const tablistRef = useRef(null);
  const keyboardNav = useRef(false);

  useEffect(() => {
    if (!keyboardNav.current) return;
    tablistRef.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.focus();
    keyboardNav.current = false;
  }, [activeTab]);

  const handleKeyDown = (e) => {
    const idx = SECTIONS.findIndex((s) => s.id === activeTab);
    let next;
    if (e.key === "ArrowRight") next = (idx + 1) % SECTIONS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SECTIONS.length - 1;
    else return;
    e.preventDefault();
    if (SECTIONS[next].id !== activeTab) {
      keyboardNav.current = true;
      setActiveTab(SECTIONS[next].id);
    }
  };

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Page header */}
      <div className="mb-5">
        <h2 className="text-2xl font-extrabold m-0 text-slate-800 font-display">Salon Settings</h2>
        <div className="text-[13px] text-slate-500 mt-1">
          Manage your business, pricing, booking rules, and more.
        </div>
      </div>

      {/* Tab bar */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={handleKeyDown}
        className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-[10px] mb-5"
      >
        {SECTIONS.map((s) => {
          const isActive = activeTab === s.id;
          return (
            <button
              key={s.id}
              role="tab"
              id={`settings-tab-${s.id}`}
              aria-selected={isActive}
              aria-controls="settings-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(s.id)}
              className={`rounded-[7px] px-3 py-[7px] text-xs font-semibold cursor-pointer font-inherit transition-all border-none ${
                isActive
                  ? "bg-white text-brand-teal shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Active section */}
      <div
        role="tabpanel"
        id="settings-panel"
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={0}
        className="focus:outline-none"
      >
        {activeTab === "business" && <BusinessSettings config={config} onUpdateConfig={onUpdateConfig} />}
        {activeTab === "hours" && <HoursSettings config={config} onUpdateConfig={onUpdateConfig} />}
        {activeTab === "account" && <AccountSettings user={user} staffProfile={staffProfile} />}
        {activeTab === "pricing" && <PricingSettings config={config} onUpdateConfig={onUpdateConfig} />}
        {activeTab === "rules" && <BookingRulesSettings config={config} onUpdateConfig={onUpdateConfig} />}
        {activeTab === "capacity" && <CapacitySettings config={config} onUpdateConfig={onUpdateConfig} />}
        {activeTab === "portal" && <CustomerPortalSettings config={config} onUpdateConfig={onUpdateConfig} />}
        {activeTab === "notifs" && <NotificationSettings config={config} onUpdateConfig={onUpdateConfig} />}
        {activeTab === "calendar" && <CalendarSettings />}
      </div>
    </div>
  );
}
