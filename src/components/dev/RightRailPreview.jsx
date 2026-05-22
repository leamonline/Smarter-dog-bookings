// ============================================================
// src/components/dev/RightRailPreview.jsx
//
// Dev-only catalogue for the right-rail tones. Renders every tone of
// every card with mocked tone records, the collapsed calm-row
// fallback, and a "mixed rail" scenario (one attention, one active,
// two calm) to verify the sort order. Mounted on /dev/right-rail-
// preview, gated by `import.meta.env.DEV` in the router so it doesn't
// bundle into production.
// ============================================================

import { MessageCircle, Clock, Clock3, ListChecks } from "lucide-react";
import { RightRailCard } from "../dashboard/RightRailCard.jsx";
import { RightRailCalmRow } from "../dashboard/RightRailCalmRow.jsx";

function Block({ title, children }) {
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>
    </section>
  );
}

function noop() {}

const fixtures = {
  inbox: {
    calm: {
      tone: "calm",
      accent: "emerald",
      heading: "WhatsApp inbox",
      icon: MessageCircle,
      primaryLine: "Inbox clear",
      ariaLabel: "WhatsApp inbox, clear",
      cta: { label: "Open inbox", onClick: noop },
    },
    active: {
      tone: "active",
      accent: "emerald",
      heading: "WhatsApp inbox",
      icon: MessageCircle,
      pillLabel: "Open",
      primaryNumber: 3,
      subtitle: "messages waiting",
      ariaLabel: "WhatsApp inbox, 3 messages waiting",
      cta: { label: "Open inbox", onClick: noop },
      aiBlock: (
        <div className="bg-white rounded-xl p-3 border border-emerald-100 text-[12px] text-slate-700 leading-relaxed">
          Helen asked if she can switch Bertie's Thursday slot to the morning, and Tom needs a quote for two cocker spaniels.
        </div>
      ),
    },
    attention: {
      tone: "attention",
      accent: "emerald",
      heading: "WhatsApp inbox",
      icon: MessageCircle,
      pillLabel: "Needs reply",
      primaryNumber: 5,
      subtitle: "oldest 4 hours ago",
      ariaLabel: "WhatsApp inbox, 5 messages need reply, oldest 4 hours ago",
      cta: { label: "Open inbox", onClick: noop },
      aiBlock: (
        <div className="bg-white rounded-xl p-3 border border-emerald-100 text-[12px] text-slate-700 leading-relaxed">
          Two clients haven't had a reply since this morning — Tom's quote and Helen's reschedule are still waiting.
        </div>
      ),
    },
  },
  reminders: {
    calm: {
      tone: "calm",
      accent: "amber",
      heading: "Reminders for Mon 25 May",
      icon: Clock,
      primaryLine: "All reminders sent · 6 of 6",
      ariaLabel: "Reminders for Mon 25 May, all 6 sent",
      cta: { label: "View reminders", onClick: noop },
    },
    active: {
      tone: "active",
      accent: "amber",
      heading: "Reminders for Mon 25 May",
      icon: Clock,
      pillLabel: "Pending",
      primaryNumber: 4,
      subtitle: "unsent of 8 bookings",
      progress: { current: 4, total: 8 },
      ariaLabel: "Reminders for Mon 25 May, 4 unsent of 8",
      cta: { label: "Send remaining", onClick: noop },
    },
    attention: {
      tone: "attention",
      accent: "amber",
      heading: "Reminders for Mon 25 May",
      icon: Clock,
      pillLabel: "Send now",
      primaryNumber: 4,
      subtitle: "unsent of 8 bookings",
      progress: { current: 4, total: 8 },
      ariaLabel: "Reminders for Mon 25 May, 4 unsent of 8, send tonight",
      cta: { label: "Send remaining", onClick: noop },
    },
  },
  waitlist: {
    calm: {
      tone: "calm",
      accent: "sky",
      heading: "Waitlist",
      icon: Clock3,
      primaryLine: "Waitlist empty",
      ariaLabel: "Waitlist, empty",
      cta: { label: "View waitlist", onClick: noop },
    },
    active: {
      tone: "active",
      accent: "sky",
      heading: "Waitlist",
      icon: Clock3,
      pillLabel: "In progress",
      primaryNumber: 4,
      subtitle: "dogs waiting",
      ariaLabel: "Waitlist, 4 dogs waiting",
      cta: { label: "Open waitlist", onClick: noop },
    },
    attention: {
      tone: "attention",
      accent: "sky",
      heading: "Waitlist",
      icon: Clock3,
      pillLabel: "Action",
      primaryNumber: 2,
      subtitle: "could be slotted in (of 6 total)",
      ariaLabel:
        "Waitlist, 2 dogs could be slotted in within the next 2 days, 6 dogs waiting total",
      cta: { label: "Open waitlist", onClick: noop },
    },
  },
  todos: {
    calm: {
      tone: "calm",
      accent: "rose",
      heading: "To-do list",
      icon: ListChecks,
      primaryLine: "No open tasks",
      ariaLabel: "To-do list, no open tasks",
      cta: { label: "View tasks", onClick: noop },
    },
    active: {
      tone: "active",
      accent: "rose",
      heading: "To-do list",
      icon: ListChecks,
      pillLabel: "Pending",
      primaryNumber: 5,
      subtitle: "open tasks",
      ariaLabel: "To-do list, 5 open tasks",
      cta: { label: "Open to-do list", onClick: noop },
    },
    attention: {
      tone: "attention",
      accent: "rose",
      heading: "To-do list",
      icon: ListChecks,
      pillLabel: "Action",
      primaryNumber: 3,
      subtitle: "overdue (of 7 total)",
      ariaLabel: "To-do list, 3 overdue of 7 open tasks",
      cta: { label: "Open to-do list", onClick: noop },
    },
  },
};

export function RightRailPreview() {
  const mixedRail = [
    fixtures.inbox.attention,
    fixtures.reminders.active,
    fixtures.waitlist.calm,
    fixtures.todos.calm,
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Right-rail tone catalogue</h1>
      <p className="text-sm text-slate-600 mb-8">
        Every tone of every card, plus the collapsed all-calm row and a mixed-rail scenario.
        Dev-only — not bundled into production.
      </p>

      <Block title="WhatsApp inbox">
        <RightRailCard {...fixtures.inbox.calm} />
        <RightRailCard {...fixtures.inbox.active} />
        <RightRailCard {...fixtures.inbox.attention} />
      </Block>

      <Block title="Tomorrow's reminders">
        <RightRailCard {...fixtures.reminders.calm} />
        <RightRailCard {...fixtures.reminders.active} />
        <RightRailCard {...fixtures.reminders.attention} />
      </Block>

      <Block title="Waitlist">
        <RightRailCard {...fixtures.waitlist.calm} />
        <RightRailCard {...fixtures.waitlist.active} />
        <RightRailCard {...fixtures.waitlist.attention} />
      </Block>

      <Block title="To-do list">
        <RightRailCard {...fixtures.todos.calm} />
        <RightRailCard {...fixtures.todos.active} />
        <RightRailCard {...fixtures.todos.attention} />
      </Block>

      <section className="mb-10">
        <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
          Collapsed all-calm row
        </h3>
        <div className="max-w-md">
          <RightRailCalmRow
            onOpenInbox={noop}
            onOpenReminders={noop}
            onOpenWaitlist={noop}
            onOpenTodos={noop}
            remindersTargetLabel="2026-05-25"
          />
        </div>
      </section>

      <section className="mb-10">
        <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
          Mixed rail — 1 attention, 1 active, 2 calm
        </h3>
        <div className="max-w-md flex flex-col gap-4">
          {mixedRail.map((props, i) => (
            <RightRailCard key={i} {...props} />
          ))}
        </div>
      </section>
    </div>
  );
}
