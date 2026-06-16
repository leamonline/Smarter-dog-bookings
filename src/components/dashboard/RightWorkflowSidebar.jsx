// ============================================================
// src/components/dashboard/RightWorkflowSidebar.jsx
//
// Right-rail container. Owns the four data hooks once (so the cards
// don't double-subscribe), resolves a tone record per card, sorts
// the cards by tone (attention > active > calm) with within-tone
// urgency as the tiebreak, and collapses to a single one-line summary
// when every card is calm. Activity feed stays below the rail.
// ============================================================

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { WhatsAppInboxCard } from "./WhatsAppInboxCard.jsx";
import { TomorrowRemindersCard } from "./TomorrowRemindersCard.jsx";
import { WaitlistCard } from "./WaitlistCard.jsx";
import { TodoListCard } from "./TodoListCard.jsx";
import { BookingHistoryCard } from "./BookingHistoryCard.jsx";
import { DeliveryFailuresCard } from "./DeliveryFailuresCard.jsx";
import { RightRailCalmRow } from "./RightRailCalmRow.jsx";
import { useWhatsAppSummary } from "../../supabase/hooks/useWhatsAppSummary.js";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders.js";
import { useDeliveryFailures } from "../../supabase/hooks/useDeliveryFailures.js";
import { useWaitlistUpcoming } from "../../supabase/hooks/useWaitlistUpcoming.js";
import { useTodos } from "../../supabase/hooks/useTodos.js";
import { resolveInboxTone } from "./tone/inbox";
import { resolveRemindersTone } from "./tone/reminders";
import { resolveWaitlistTone } from "./tone/waitlist";
import { resolveTodosTone } from "./tone/todos";

const TONE_RANK = { attention: 0, active: 1, calm: 2 };

export function RightWorkflowSidebar({ onOpenWaitlist, onOpenTodos }) {
  const navigate = useNavigate();
  const inboxData = useWhatsAppSummary();
  const remindersData = useTomorrowReminders();
  const failuresData = useDeliveryFailures();
  const { entries: waitlistEntries, loading: waitlistLoading } =
    useWaitlistUpcoming();
  const { todos, loading: todosLoading } = useTodos();

  const tones = useMemo(() => {
    return {
      inbox: resolveInboxTone({
        awaitingReply: inboxData.awaitingReply,
        oldestUnansweredAt: inboxData.oldestUnansweredAt,
      }),
      reminders: resolveRemindersTone({
        targetDate: remindersData.targetDate,
        sentCount: remindersData.sentCount,
        totalCount: remindersData.totalCount,
      }),
      waitlist: resolveWaitlistTone({ entries: waitlistEntries }),
      todos: resolveTodosTone({ todos }),
    };
  }, [
    inboxData.awaitingReply,
    inboxData.oldestUnansweredAt,
    remindersData.targetDate,
    remindersData.sentCount,
    remindersData.totalCount,
    waitlistEntries,
    todos,
  ]);

  const anyLoading =
    inboxData.loading ||
    remindersData.loading ||
    waitlistLoading ||
    todosLoading;

  // Render each card with stable identity so the DOM reorder doesn't
  // remount them (the inbox AI summary panel would otherwise flicker).
  const cards = useMemo(
    () =>
      [
        // Delivery failures only appear when there are any — always at the top
        // (attention + highest urgency) so a broken number can't be missed.
        ...(failuresData.count > 0
          ? [
              {
                key: "delivery-failures",
                tone: { tone: "attention", urgency: 100 },
                canonicalIndex: -1,
                node: <DeliveryFailuresCard data={failuresData} />,
              },
            ]
          : []),
        {
          key: "inbox",
          tone: tones.inbox,
          canonicalIndex: 0,
          node: (
            <WhatsAppInboxCard data={inboxData} onOpen={() => navigate("/whatsapp")} />
          ),
        },
        {
          key: "reminders",
          tone: tones.reminders,
          canonicalIndex: 1,
          node: <TomorrowRemindersCard data={remindersData} />,
        },
        {
          key: "waitlist",
          tone: tones.waitlist,
          canonicalIndex: 2,
          node: (
            <WaitlistCard
              entries={waitlistEntries}
              loading={waitlistLoading}
              onOpen={onOpenWaitlist}
            />
          ),
        },
        {
          key: "todos",
          tone: tones.todos,
          canonicalIndex: 3,
          node: (
            <TodoListCard
              todos={todos}
              loading={todosLoading}
              onOpen={onOpenTodos}
            />
          ),
        },
      ].sort((a, b) => {
        const dt = TONE_RANK[a.tone.tone] - TONE_RANK[b.tone.tone];
        if (dt !== 0) return dt;
        const du = (b.tone.urgency ?? 0) - (a.tone.urgency ?? 0);
        if (du !== 0) return du;
        return a.canonicalIndex - b.canonicalIndex;
      }),
    [
      tones,
      inboxData,
      remindersData,
      failuresData,
      waitlistEntries,
      waitlistLoading,
      todos,
      todosLoading,
      navigate,
      onOpenWaitlist,
      onOpenTodos,
    ],
  );

  // While anything is still loading we don't yet know each card's true tone,
  // so keep them all as full cards rather than collapsing prematurely.
  const loud = anyLoading ? cards : cards.filter((c) => c.tone.tone !== "calm");
  const calm = anyLoading ? [] : cards.filter((c) => c.tone.tone === "calm");

  // Each calm card folds into a single tertiary-link chip in the summary row.
  const calmChipFor = (key) => {
    switch (key) {
      case "inbox":
        return { key, label: "Inbox clear", hue: "emerald", onClick: () => navigate("/whatsapp") };
      case "reminders":
        return {
          key,
          label: remindersData.totalCount > 0 ? "All reminders sent" : "No bookings tomorrow",
          hue: "amber",
          onClick: () => {
            /* no destination — TomorrowRemindersCard owns the loud UI */
          },
        };
      case "waitlist":
        return { key, label: "Waitlist empty", hue: "sky", onClick: onOpenWaitlist };
      case "todos":
        return { key, label: "No open tasks", hue: "rose", onClick: onOpenTodos };
      default:
        return null;
    }
  };
  const calmChips = calm.map((c) => calmChipFor(c.key)).filter(Boolean);

  return (
    <aside
      className="flex flex-col gap-4"
      aria-label="Workflow inbox and quick actions"
    >
      {/* Loud cards (attention / active) stay full and sit on top; the calm
          remainder collapses into one compact summary row beneath them so it
          supports the schedule rather than competing with it. */}
      {loud.map((c) => (
        <div key={c.key}>{c.node}</div>
      ))}
      {calmChips.length > 0 && <RightRailCalmRow chips={calmChips} />}
      <BookingHistoryCard />
    </aside>
  );
}
