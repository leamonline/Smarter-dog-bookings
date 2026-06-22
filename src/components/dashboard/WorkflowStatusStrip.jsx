// ============================================================
// src/components/dashboard/WorkflowStatusStrip.jsx
//
// Mobile/tablet (< xl) home for the workflow panels. On a phone the
// full schedule is long, so the tabbed UtilityTabs used to sit buried
// at the bottom of the page where urgent items went unseen. This is a
// compact, collapsible strip that lives ABOVE the schedule: collapsed,
// it surfaces the pending counts (unread inbox, reminders to send,
// waitlist, open tasks) at a glance; expanded, it reveals the full
// UtilityTabs. Delivery failures are the one thing that must never be
// missed, so their card stays fully visible above the toggle whenever
// there are any — never gated behind the expand.
//
// Desktop (xl+) keeps the full RightWorkflowSidebar in the right rail;
// this strip is `xl:hidden` at the call site.
// ============================================================

import { useState } from "react";
import { MessageCircle, BellRing, Clock3, ListChecks, ChevronDown } from "lucide-react";
import { UtilityTabs } from "./UtilityTabs.jsx";
import { DeliveryFailuresCard } from "./DeliveryFailuresCard.jsx";

// Per-category hue for the collapsed count chips — mirrors the right-rail
// card hues so a category stays identifiable across surfaces.
const HUE = {
  cyan: "bg-cyan-50 text-cyan-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  rose: "bg-rose-50 text-rose-700",
};

export function WorkflowStatusStrip({
  failures,
  onSelectFailure,
  messageCount = 0,
  reminderCount = 0,
  waitlistCount = 0,
  todoCount = 0,
  reminderData,
  onOpenWaitlist,
  onOpenTodos,
  onCreateBookingFromWhatsApp,
  waitlistLoading = false,
  todoLoading = false,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = "workflow-strip-panel";

  const failureCount = failures?.count ?? 0;

  // singular / plural copy is used in the accessible summary so screen
  // readers hear "3 unread messages" rather than a bare "3".
  const items = [
    { id: "inbox", icon: MessageCircle, count: messageCount, hue: "cyan", one: "unread message", many: "unread messages" },
    { id: "reminders", icon: BellRing, count: reminderCount, hue: "amber", one: "reminder to send", many: "reminders to send" },
    { id: "waitlist", icon: Clock3, count: waitlistCount, hue: "sky", one: "on the waitlist", many: "on the waitlist" },
    { id: "tasks", icon: ListChecks, count: todoCount, hue: "rose", one: "open task", many: "open tasks" },
  ];
  const active = items.filter((it) => it.count > 0);

  // Accessible summary — the visible chips are icon+number only, so the
  // button carries the full meaning. Failures are listed too so the
  // toggle honestly reflects everything still pending.
  const summaryParts = [];
  if (failureCount > 0)
    summaryParts.push(`${failureCount} delivery ${failureCount === 1 ? "issue" : "issues"}`);
  for (const it of active) summaryParts.push(`${it.count} ${it.count === 1 ? it.one : it.many}`);
  const summary = summaryParts.length ? summaryParts.join(", ") : "all clear";
  const ariaLabel = `Workflow panel: ${summary}. ${
    expanded ? "Expanded — activate to collapse." : "Collapsed — activate to expand."
  }`;

  return (
    <div className="flex flex-col gap-2">
      {/* Delivery failures never hide behind the expand — a broken number
          must surface even when the strip is collapsed. */}
      {failureCount > 0 && (
        <DeliveryFailuresCard data={failures} onSelectFailure={onSelectFailure} />
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={ariaLabel}
        className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] cursor-pointer font-[inherit] text-left"
      >
        <span className="shrink-0 text-brand-purple font-semibold text-[13px]">
          Workflow
        </span>
        <span
          className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0"
          aria-hidden="true"
        >
          {active.length === 0 ? (
            <span className="text-[12px] font-semibold text-emerald-700">All clear</span>
          ) : (
            active.map((it) => {
              const Icon = it.icon;
              return (
                <span
                  key={it.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-bold leading-none ${HUE[it.hue]}`}
                >
                  <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
                  {it.count > 99 ? "99+" : it.count}
                </span>
              );
            })
          )}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2.4}
          aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Mounted only when expanded — the collapsed strip already carries the
          counts, so the bare cards (and their data hooks) don't run until
          the operator opens the panel. */}
      {expanded && (
        <div id={panelId}>
          <UtilityTabs
            waitlistCount={waitlistCount}
            todoCount={todoCount}
            messageCount={messageCount}
            reminderCount={reminderCount}
            reminderData={reminderData}
            onOpenWaitlist={onOpenWaitlist}
            onOpenTodos={onOpenTodos}
            onCreateBookingFromWhatsApp={onCreateBookingFromWhatsApp}
            waitlistLoading={waitlistLoading}
            todoLoading={todoLoading}
          />
        </div>
      )}
    </div>
  );
}
