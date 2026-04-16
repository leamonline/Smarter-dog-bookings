import { useState, useRef } from "react";
import { useTodos } from "../../supabase/hooks/useTodos.js";

export function SidebarTodos() {
  const { todos, loading, addTodo, toggleTodo, removeTodo, moveTodo } = useTodos();
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const handleAdd = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await addTodo(text);
    inputRef.current?.focus();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="bg-gradient-to-br from-brand-teal to-[#1E6B5C] px-4 py-2.5">
        <div className="text-sm font-extrabold text-white font-display">To-Do List</div>
      </div>

      <div className="p-3">
        {/* Add input */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
          className="flex gap-1.5 mb-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20 transition-colors"
          />
          <button
            type="submit"
            className="w-8 h-8 rounded-lg bg-brand-teal text-white border-none flex items-center justify-center cursor-pointer transition-all text-lg font-bold hover:bg-[#1E6B5C] shrink-0"
          >
            +
          </button>
        </form>

        {/* Todo list */}
        {loading ? (
          <div className="text-center text-xs text-slate-400 py-3">Loading...</div>
        ) : todos.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-3">No notes yet</div>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {todos.map((todo, i) => (
              <li
                key={todo.id}
                className={`group flex items-start gap-1.5 py-1.5 px-2 rounded-lg transition-colors hover:bg-slate-50 ${todo.done ? "opacity-50" : ""}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleTodo(todo.id)}
                  aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                  className={`w-4 h-4 mt-0.5 rounded border-[1.5px] flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                    todo.done
                      ? "bg-brand-teal border-brand-teal text-white"
                      : "bg-white border-slate-300 hover:border-brand-teal"
                  }`}
                >
                  {todo.done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                {/* Text */}
                <span className={`flex-1 text-xs leading-relaxed break-words ${todo.done ? "line-through text-slate-400" : "text-slate-700"}`}>
                  {todo.text}
                </span>

                {/* Actions — visible on hover */}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {i > 0 && (
                    <button
                      onClick={() => moveTodo(i, -1)}
                      aria-label="Move up"
                      title="Move up"
                      className="w-5 h-5 rounded bg-transparent border-none text-slate-400 cursor-pointer flex items-center justify-center hover:text-slate-700 hover:bg-slate-100"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                  )}
                  {i < todos.length - 1 && (
                    <button
                      onClick={() => moveTodo(i, 1)}
                      aria-label="Move down"
                      title="Move down"
                      className="w-5 h-5 rounded bg-transparent border-none text-slate-400 cursor-pointer flex items-center justify-center hover:text-slate-700 hover:bg-slate-100"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  )}
                  <button
                    onClick={() => removeTodo(todo.id)}
                    aria-label="Delete"
                    title="Delete"
                    className="w-5 h-5 rounded bg-transparent border-none text-slate-400 cursor-pointer flex items-center justify-center hover:text-brand-coral hover:bg-brand-coral/10"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
