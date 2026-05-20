import { ListChecks } from "lucide-react";
import { CountBadgeCard } from "./CountBadgeCard.jsx";

export function TodoListCard({ count = 0, onOpen, bare = false, loading = false }) {
  const ariaLabel = loading
    ? "To-do list, loading"
    : `To-do list, ${count} ${count === 1 ? "task" : "tasks"} — click to view all`;
  return (
    <CountBadgeCard
      heading="To-do list"
      icon={ListChecks}
      accent="rose"
      count={count}
      singular="open task"
      plural="open tasks"
      ariaLabel={ariaLabel}
      onOpen={onOpen}
      bare={bare}
      loading={loading}
    />
  );
}
