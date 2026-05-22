import type { ToneRecord } from "./types";

export type TodoLike = { done?: boolean; created_at?: string | null };

export type TodosToneInput = {
  todos: TodoLike[];
  now?: Date;
};

// Age proxy for "overdue" — salon_todos has no due_date column. Any
// open task whose created_at is older than this is considered overdue.
const OVERDUE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function resolveTodosTone({ todos, now }: TodosToneInput): ToneRecord {
  const open = (todos ?? []).filter((t) => !t.done);
  const openCount = open.length;
  if (openCount === 0) {
    return {
      tone: "calm",
      pillLabel: null,
      primaryNumber: null,
      primaryLine: "No open tasks",
      subtitle: null,
      ariaSummary: "To-do list, no open tasks",
      urgency: 0,
      progress: null,
    };
  }

  const nowMs = (now ?? new Date()).getTime();
  const overdue = open.filter((t) => {
    if (!t.created_at) return false;
    const ms = new Date(t.created_at).getTime();
    if (!Number.isFinite(ms)) return false;
    return nowMs - ms >= OVERDUE_THRESHOLD_MS;
  });
  const overdueCount = overdue.length;

  if (overdueCount > 0) {
    return {
      tone: "attention",
      pillLabel: "Action",
      primaryNumber: overdueCount,
      primaryLine: null,
      subtitle: `overdue (of ${openCount} total)`,
      ariaSummary: `To-do list, ${overdueCount} overdue of ${openCount} open ${
        openCount === 1 ? "task" : "tasks"
      }`,
      urgency: overdueCount,
      progress: null,
    };
  }

  return {
    tone: "active",
    pillLabel: "Pending",
    primaryNumber: openCount,
    primaryLine: null,
    subtitle: openCount === 1 ? "open task" : "open tasks",
    ariaSummary: `To-do list, ${openCount} open ${
      openCount === 1 ? "task" : "tasks"
    }`,
    urgency: 0,
    progress: null,
  };
}
