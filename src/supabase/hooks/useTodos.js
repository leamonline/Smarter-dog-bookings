import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";

export function useTodos() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("salon_todos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (!cancelled) {
        if (!error && data) setTodos(data);
        setLoading(false);
      }
    })();

    // ── Realtime ───────────────────────────────────────────────
    const channel = supabase
      .channel("salon-todos")
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
            .then(({ data }) => { if (data && !cancelled) setTodos(data); });
        },
      )
      .subscribe();

    return () => { cancelled = true; channel.unsubscribe(); };
  }, []);

  // ── Add ────────────────────────────────────────────────────────
  const addTodo = useCallback(async (text) => {
    if (!supabase || !text.trim()) return;
    const maxOrder = todos.length > 0
      ? Math.max(...todos.map((t) => t.sort_order)) + 1
      : 0;

    const { data, error } = await supabase
      .from("salon_todos")
      .insert({ text: text.trim(), sort_order: maxOrder })
      .select()
      .single();

    if (!error && data) setTodos((prev) => [...prev, data]);
  }, [todos]);

  // ── Add multiple (batch) ───────────────────────────────────────
  const addTodos = useCallback(async (items) => {
    if (!supabase || items.length === 0) return;
    const maxOrder = todos.length > 0
      ? Math.max(...todos.map((t) => t.sort_order)) + 1
      : 0;

    const rows = items.map((text, i) => ({
      text: text.trim(),
      sort_order: maxOrder + i,
    }));

    const { data, error } = await supabase
      .from("salon_todos")
      .insert(rows)
      .select();

    if (!error && data) setTodos((prev) => [...prev, ...data]);
  }, [todos]);

  // ── Toggle done ────────────────────────────────────────────────
  const toggleTodo = useCallback(async (id) => {
    const todo = todos.find((t) => t.id === id);
    if (!supabase || !todo) return;

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

    await supabase
      .from("salon_todos")
      .update({ done: !todo.done, updated_at: new Date().toISOString() })
      .eq("id", id);
  }, [todos]);

  // ── Remove ─────────────────────────────────────────────────────
  const removeTodo = useCallback(async (id) => {
    if (!supabase) return;

    setTodos((prev) => prev.filter((t) => t.id !== id));

    await supabase.from("salon_todos").delete().eq("id", id);
  }, []);

  // ── Reorder ────────────────────────────────────────────────────
  const moveTodo = useCallback(async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= todos.length) return;

    const next = [...todos];
    [next[index], next[target]] = [next[target], next[index]];

    // Update sort_order for both
    const updates = next.map((t, i) => ({ ...t, sort_order: i }));
    setTodos(updates);

    if (supabase) {
      await Promise.all([
        supabase.from("salon_todos").update({ sort_order: index, updated_at: new Date().toISOString() }).eq("id", next[index].id),
        supabase.from("salon_todos").update({ sort_order: target, updated_at: new Date().toISOString() }).eq("id", next[target].id),
      ]);
    }
  }, [todos]);

  return { todos, loading, addTodo, addTodos, toggleTodo, removeTodo, moveTodo };
}
