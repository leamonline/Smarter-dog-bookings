import { useState, useEffect, useId, useCallback } from "react";
import { supabase } from "../client.js";

export function useTodos() {
  const instanceId = useId();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    const controller = new AbortController();

    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("salon_todos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (fetchErr) {
        setError(fetchErr.message || "Couldn't load to-do list.");
      } else if (data) {
        setTodos(data);
      }
      setLoading(false);
    })();

    // ── Realtime ───────────────────────────────────────────────
    // Per-instance channel name — Supabase reuses channels by name, so
    // a shared name across simultaneous mounts (RightWorkflowSidebar +
    // WeekCalendarView both mount on the Bookings page) causes the
    // second mount to call `.on()` on an already-subscribed channel
    // and throw.
    const channel = supabase
      .channel(`salon-todos:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "salon_todos" },
        () => {
          // Re-fetch on any change (keeps order correct)
          supabase
            .from("salon_todos")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
            .abortSignal(controller.signal)
            .then(({ data }) => {
              if (controller.signal.aborted) return;
              if (data) setTodos(data);
            });
        },
      )
      .subscribe();

    return () => { controller.abort(); channel.unsubscribe(); };
  }, [instanceId]);

  // All mutations return { ok: true } | { ok: false, error: string } so
  // callers can toast on failure. Optimistic update + rollback keeps the
  // UI from drifting away from the server's authoritative state.

  // ── Add ────────────────────────────────────────────────────────
  const addTodo = useCallback(async (text) => {
    if (!supabase || !text.trim()) return { ok: true };
    const maxOrder = todos.length > 0
      ? Math.max(...todos.map((t) => t.sort_order)) + 1
      : 0;

    const { data, error: insertErr } = await supabase
      .from("salon_todos")
      .insert({ text: text.trim(), sort_order: maxOrder })
      .select()
      .single();

    if (insertErr) {
      return { ok: false, error: insertErr.message || "Couldn't add task." };
    }
    if (data) setTodos((prev) => [...prev, data]);
    return { ok: true };
  }, [todos]);

  // ── Add multiple (batch) ───────────────────────────────────────
  const addTodos = useCallback(async (items) => {
    if (!supabase || items.length === 0) return { ok: true };
    const maxOrder = todos.length > 0
      ? Math.max(...todos.map((t) => t.sort_order)) + 1
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
    if (data) setTodos((prev) => [...prev, ...data]);
    return { ok: true };
  }, [todos]);

  // ── Toggle done ────────────────────────────────────────────────
  const toggleTodo = useCallback(async (id) => {
    const todo = todos.find((t) => t.id === id);
    if (!supabase || !todo) return { ok: true };

    const prev = todos;
    setTodos((curr) => curr.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

    const { error: updateErr } = await supabase
      .from("salon_todos")
      .update({ done: !todo.done, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateErr) {
      setTodos(prev);
      return { ok: false, error: updateErr.message || "Couldn't update task." };
    }
    return { ok: true };
  }, [todos]);

  // ── Remove ─────────────────────────────────────────────────────
  const removeTodo = useCallback(async (id) => {
    if (!supabase) return { ok: true };

    const prev = todos;
    setTodos((curr) => curr.filter((t) => t.id !== id));

    const { error: deleteErr } = await supabase
      .from("salon_todos")
      .delete()
      .eq("id", id);

    if (deleteErr) {
      setTodos(prev);
      return { ok: false, error: deleteErr.message || "Couldn't remove task." };
    }
    return { ok: true };
  }, [todos]);

  // ── Reorder ────────────────────────────────────────────────────
  const moveTodo = useCallback(async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= todos.length) return { ok: true };

    const prev = todos;
    const next = [...todos];
    [next[index], next[target]] = [next[target], next[index]];

    // Update sort_order for both
    const updates = next.map((t, i) => ({ ...t, sort_order: i }));
    setTodos(updates);

    if (!supabase) return { ok: true };

    const [a, b] = await Promise.all([
      supabase.from("salon_todos").update({ sort_order: index, updated_at: new Date().toISOString() }).eq("id", next[index].id),
      supabase.from("salon_todos").update({ sort_order: target, updated_at: new Date().toISOString() }).eq("id", next[target].id),
    ]);
    if (a.error || b.error) {
      setTodos(prev);
      return { ok: false, error: (a.error || b.error).message || "Couldn't reorder." };
    }
    return { ok: true };
  }, [todos]);

  return { todos, loading, error, addTodo, addTodos, toggleTodo, removeTodo, moveTodo };
}
