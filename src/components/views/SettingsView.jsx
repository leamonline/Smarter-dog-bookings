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
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

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

export function SettingsView({ config, onUpdateConfig, user, staffProfile, canEdit = true }) {
  const [activeTab, setActiveTab] = useState("business");
  const tablistRef = useRef(null);
  const keyboardNav = useRef(false);

  // The explicit-save tabs (Business, Hours, Account) report unsaved edits up
  // here so we can guard against losing them on a tab switch or page unload.
  const [dirty, setDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);

  useEffect(() => {
    if (!keyboardNav.current) return;
    tablistRef.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.focus();
    keyboardNav.current = false;
  }, [activeTab]);

  // Warn before a full-page unload (refresh/close) when there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Guarded tab switch — if the current tab has unsaved edits, confirm before
  // leaving (which would discard them). Clean tabs switch immediately.
  const requestTab = (id, viaKeyboard = false) => {
    if (id === activeTab) return;
    keyboardNav.current = viaKeyboard;
    if (dirty) {
      setPendingTab(id);
      return;
    }
    setActiveTab(id);
  };

  const confirmDiscard = () => {
    setDirty(false);
    if (pendingTab) setActiveTab(pendingTab);
    setPendingTab(null);
  };

  const handleKeyDown = (e) => {
    const idx = SECTIONS.findIndex((s) => s.id === activeTab);
    let next;
    if (e.key === "ArrowRight") next = (idx + 1) % SECTIONS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SECTIONS.length - 1;
    else return;
    e.preventDefault();
    requestTab(SECTIONS[next].id, true);
  };

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Page header */}
      <div className="mb-5">
        <h2 className="text-2xl font-extrabold m-0 text-slate-800 font-display">Salon Settings</h2>
        <div className="text-body text-slate-500 mt-1">
          Manage your business, pricing, booking rules, and more.
        </div>
      </div>

      {!canEdit && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900"
        >
          Staff can't edit these settings — please ask an owner to make changes
        </div>
      )}

      {/* Tab bar */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={handleKeyDown}
        className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-control mb-5"
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
              onClick={() => requestTab(s.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer font-[inherit] motion-safe:transition-all border-none ${
                isActive
                  ? "bg-white text-brand-teal shadow-sm"
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
        {activeTab === "business" && <BusinessSettings config={config} onUpdateConfig={onUpdateConfig} canEdit={canEdit} onDirtyChange={setDirty} />}
        {activeTab === "hours" && <HoursSettings config={config} onUpdateConfig={onUpdateConfig} canEdit={canEdit} onDirtyChange={setDirty} />}
        {activeTab === "account" && <AccountSettings user={user} staffProfile={staffProfile} onDirtyChange={setDirty} />}
        {activeTab === "pricing" && <PricingSettings config={config} onUpdateConfig={onUpdateConfig} canEdit={canEdit} />}
        {activeTab === "rules" && <BookingRulesSettings config={config} onUpdateConfig={onUpdateConfig} canEdit={canEdit} />}
        {activeTab === "capacity" && <CapacitySettings config={config} onUpdateConfig={onUpdateConfig} canEdit={canEdit} />}
        {activeTab === "portal" && <CustomerPortalSettings config={config} onUpdateConfig={onUpdateConfig} canEdit={canEdit} />}
        {activeTab === "notifs" && <NotificationSettings config={config} onUpdateConfig={onUpdateConfig} canEdit={canEdit} />}
        {activeTab === "calendar" && <CalendarSettings />}
      </div>

      {pendingTab && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message="You've made changes here. If you leave now, they'll be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          variant="danger"
          onConfirm={confirmDiscard}
          onCancel={() => setPendingTab(null)}
        />
      )}
    </div>
  );
}
