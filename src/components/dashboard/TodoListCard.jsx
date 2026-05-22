import { ListChecks } from "lucide-react";
import { RightRailCard } from "./RightRailCard.jsx";
import { resolveTodosTone } from "./tone/todos";

// Right-rail To-do card. Like WaitlistCard, accepts either the full
// todos array (right rail path) or a fallback count (UtilityTabs).
// Without created_at timestamps the resolver can't compute overdue,
// so the count-only path tops out at active.
export function TodoListCard({
  todos = [],
  count = null,
  onOpen,
  loading = false,
  bare = false,
}) {
  const effectiveTodos =
    todos.length > 0
      ? todos
      : count && count > 0
        ? Array.from({ length: count }, () => ({ done: false, created_at: null }))
        : [];

  const tone = resolveTodosTone({ todos: effectiveTodos });
  return (
    <RightRailCard
      tone={tone.tone}
      accent="rose"
      heading="To-do list"
      icon={ListChecks}
      pillLabel={tone.pillLabel}
      primaryNumber={tone.primaryNumber}
      primaryLine={tone.primaryLine}
      subtitle={tone.subtitle}
      ariaLabel={tone.ariaSummary}
      loading={loading}
      bare={bare}
      cta={onOpen ? { label: tone.tone === "calm" ? "View tasks" : "Open to-do list", onClick: onOpen } : null}
    />
  );
}
