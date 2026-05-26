import { useState } from "react";
import { MessageCircle, Clock3, ListChecks, BellRing } from "lucide-react";
import { WhatsAppInboxCard } from "./WhatsAppInboxCard.jsx";
import { WaitlistCard } from "./WaitlistCard.jsx";
import { TodoListCard } from "./TodoListCard.jsx";
import { TomorrowRemindersCard } from "./TomorrowRemindersCard.jsx";

const TABS = [
  { id: "inbox", label: "Inbox", icon: MessageCircle },
  { id: "reminders", label: "Reminders", icon: BellRing },
  { id: "waitlist", label: "Waitlist", icon: Clock3 },
  { id: "tasks", label: "Tasks", icon: ListChecks },
];

export function UtilityTabs({
  waitlistCount,
  todoCount,
  messageCount,
  reminderCount,
  reminderData,
  onOpenWaitlist,
  onOpenTodos,
  onCreateBookingFromWhatsApp,
  defaultTab = "inbox",
  waitlistLoading = false,
  todoLoading = false,
}) {
  const [active, setActive] = useState(defaultTab);

  const badge = (id) => {
    if (id === "inbox" && messageCount > 0) return messageCount;
    if (id === "reminders" && reminderCount > 0) return reminderCount;
    if (id === "waitlist" && waitlistCount > 0) return waitlistCount;
    if (id === "tasks" && todoCount > 0) return todoCount;
    return null;
  };

  return (
    <section
      aria-label="Workflow tools"
      className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
    >
      <div
        role="tablist"
        aria-label="Utility tabs"
        className="flex border-b border-slate-100 bg-slate-50/60"
      >
        {TABS.map((t) => {
          const isActive = t.id === active;
          const Icon = t.icon;
          const count = badge(t.id);
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`utility-panel-${t.id}`}
              id={`utility-tab-${t.id}`}
              type="button"
              onClick={() => setActive(t.id)}
              className={`flex-1 min-w-0 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-1.5 py-2 text-[12px] font-semibold transition-all border-none cursor-pointer font-[inherit] relative ${
                isActive
                  ? "text-brand-purple bg-white"
                  : "text-slate-500 bg-transparent hover:text-brand-purple hover:bg-white/60"
              }`}
            >
              <Icon size={14} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{t.label}</span>
              {count != null && (
                <span
                  className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center leading-none ${
                    isActive
                      ? "bg-brand-yellow text-brand-purple"
                      : "bg-brand-coral text-white"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
              {isActive && (
                <span
                  className="absolute bottom-0 left-3 right-3 h-0.5 bg-brand-yellow rounded-t-full"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`utility-panel-${active}`}
        aria-labelledby={`utility-tab-${active}`}
        className="p-3"
      >
        {active === "inbox" && (
          <WhatsAppInboxCard onCreateBooking={onCreateBookingFromWhatsApp} bare />
        )}
        {active === "reminders" && (
          <TomorrowRemindersCard bare data={reminderData} />
        )}
        {active === "waitlist" && (
          <WaitlistCard count={waitlistCount} onOpen={onOpenWaitlist} bare loading={waitlistLoading} />
        )}
        {active === "tasks" && (
          <TodoListCard count={todoCount} onOpen={onOpenTodos} bare loading={todoLoading} />
        )}
      </div>
    </section>
  );
}
