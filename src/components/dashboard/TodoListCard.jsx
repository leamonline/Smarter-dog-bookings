import { ListChecks } from "lucide-react";
import { CountBadgeCard } from "./CountBadgeCard.jsx";

export function TodoListCard({ count = 0, onOpen, bare = false }) {
  return (
    <CountBadgeCard
      heading="To-do list"
      icon={ListChecks}
      accent="rose"
      count={count}
      singular="open task"
      plural="open tasks"
      ariaLabel={`To-do list, ${count} ${count === 1 ? "task" : "tasks"} — click to view all`}
      onOpen={onOpen}
      bare={bare}
    />
  );
}
