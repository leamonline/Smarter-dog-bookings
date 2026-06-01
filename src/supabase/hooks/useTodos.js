// ============================================================
// src/supabase/hooks/useTodos.js
//
// Salon to-do list, shared across every component that mounts the hook.
//
// Module-level singleton + useSyncExternalStore + a single ref-counted
// realtime channel, so the simultaneous mounts on the Bookings page
// (WeekCalendarView AND the RightWorkflowSidebar it renders, plus the
// TodoModal when open) share ONE fetch and ONE subscription instead of
// each issuing its own salon_todos query. Same shape as
// useWhatsAppUnread / useWhatsAppSummary.
//
// Returns the same surface as before:
//   { todos, loading, error, addTodo, addTodos, toggleTodo, removeTodo, moveTodo }
// ============================================================

import { useSyncExternalStore, useMemo } from "react";
import { supabase } from "../client.js";
import { registerResume } from "../refreshOnResume.js";

let state = { todos: [], loading: true, error: null };
let channel = null;
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

// Stable ordering — sort_order first, created_at as the tiebreak.
function orderedTodos(query) {
  return query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}

async function refresh() {
  if (!supabase) {
    if (state.loading) setState({ loading: false });
    return;
  }
  const { data, error } = await orderedTodos(
    supabase.from("salon_todos").select("*"),
  );
  if (error) {
    setState({ error: error.message || "Couldn't load to-do list.", loading: false });
    return;
  }
  setState({ todos: data ?? [], error: null, loading: false });
}

function startChannel() {
  if (channel || !supabase) return;
  // Single shared channel — only one subscriber now, so a static topic
  // name is safe (the old per-instance useId() name existed only to stop
  // two mounts colliding on the same channel).
  channel = supabase
    .channel("salon-todos")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "salon_todos" },
      () => refresh(),
    )
    .subscribe();
}

function stopChannel() {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    startChannel();
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopChannel();
  };
}

function getSnapshot() {
  return state;
}

// Reconcile on resume (tab visible again / back online) so a realtime
// event missed while the iPad slept doesn't leave the list stale.
// Guarded on listeners so we don't fetch when nothing is mounted.
registerResume(() => {
  if (listeners.size > 0) refresh();
});

// ── Mutations ────────────────────────────────────────────────
// Optimistic update against the shared store + rollback on error, so
// every mounted card reflects the change immediately. The realtime echo
// reconciles with the server's authoritative state. Bodies mirror the
// previous per-instance hook exactly — only the state plumbing changed
// (module store instead of React useState).

async function addTodo(text) {
  if (!supabase || !text.trim()) return { ok: true };
  const maxOrder =
    state.todos.length > 0
      ? Math.max(...state.todos.map((t) => t.sort_order)) + 1
      : 0;

  const { data, error: insertErr } = await supabase
    .from("salon_todos")
    .insert({ text: text.trim(), sort_order: maxOrder })
    .select()
    .single();

  if (insertErr) {
    return { ok: false, error: insertErr.message || "Couldn't add task." };
  }
  if (data) setState({ todos: [...state.todos, data] });
  return { ok: true };
}

async function addTodos(items) {
  if (!supabase || items.length === 0) return { ok: true };
  const maxOrder =
    state.todos.length > 0
      ? Math.max(...state.todos.map((t) => t.sort_order)) + 1
      : 0;

  const rows = items.map((text, i) => ({
    text: text.trim(),
    sort_order: maxOrder + i,
  }));

  const { data, error: insertErr } = await supabase
    .from("salon_todos")
    .insert(rows)
    .select();

  if (insertErr) {
    return { ok: false, error: insertErr.message || "Couldn't add tasks." };
  }
  if (data) setState({ todos: [...state.todos, ...data] });
  return { ok: true };
}

async function toggleTodo(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!supabase || !todo) return { ok: true };

  const prev = state.todos;
  setState({ todos: prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });

  const { error: updateErr } = await supabase
    .from("salon_todos")
    .update({ done: !todo.done, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    setState({ todos: prev });
    return { ok: false, error: updateErr.message || "Couldn't update task." };
  }
  return { ok: true };
}

async function removeTodo(id) {
  if (!supabase) return { ok: true };

  const prev = state.todos;
  setState({ todos: prev.filter((t) => t.id !== id) });

  const { error: deleteErr } = await supabase
    .from("salon_todos")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    setState({ todos: prev });
    return { ok: false, error: deleteErr.message || "Couldn't remove task." };
  }
  return { ok: true };
}

async function moveTodo(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.todos.length) return { ok: true };

  const prev = state.todos;
  const next = [...prev];
  [next[index], next[target]] = [next[target], next[index]];

  // Optimistic full reindex; the two persisted rows below carry the
  // authoritative swap and realtime reconciles the rest.
  const updates = next.map((t, i) => ({ ...t, sort_order: i }));
  setState({ todos: updates });

  if (!supabase) return { ok: true };

  const [a, b] = await Promise.all([
    supabase.from("salon_todos").update({ sort_order: index, updated_at: new Date().toISOString() }).eq("id", next[index].id),
    supabase.from("salon_todos").update({ sort_order: target, updated_at: new Date().toISOString() }).eq("id", next[target].id),
  ]);
  if (a.error || b.error) {
    setState({ todos: prev });
    return { ok: false, error: (a.error || b.error).message || "Couldn't reorder." };
  }
  return { ok: true };
}

// Module-level refs — stable identity so consumers can pass them to
// effect/memo deps without re-triggering.
const actions = { addTodo, addTodos, toggleTodo, removeTodo, moveTodo };

export function useTodos() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(
    () => ({
      todos: snapshot.todos,
      loading: snapshot.loading,
      error: snapshot.error,
      ...actions,
    }),
    [snapshot],
  );
}
