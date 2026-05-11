import { WhatsAppInboxCard } from "./WhatsAppInboxCard.jsx";
import { WaitlistCard } from "./WaitlistCard.jsx";
import { TodoListCard } from "./TodoListCard.jsx";

export function RightWorkflowSidebar({
  waitlistCount,
  todoCount,
  onOpenWaitlist,
  onOpenTodos,
  onCreateBookingFromWhatsApp,
}) {
  return (
    <aside className="flex flex-col gap-4" aria-label="Workflow inbox and quick actions">
      <WhatsAppInboxCard onCreateBooking={onCreateBookingFromWhatsApp} />
      <WaitlistCard count={waitlistCount} onOpen={onOpenWaitlist} />
      <TodoListCard count={todoCount} onOpen={onOpenTodos} />
    </aside>
  );
}
