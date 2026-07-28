import { useRef, useState } from "react";
import { X } from "lucide-react";
import { useTodos } from "../../supabase/hooks/useTodos.js";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { InlineError } from "../ui/InlineError.jsx";

export function RescheduleRequestTodo({
  todo,
  decideRescheduleRequest,
  reportFailure,
}) {
  const [denying, setDenying] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [inFlight, setInFlight] = useState(false);

  const handleApprove = async () => {
    setInFlight(true);
    const result = await decideRescheduleRequest(
      todo.booking_change_request_id,
      "approve",
      "Approved by staff",
    );
    reportFailure(result, "Couldn't approve that request — try again?");
    setInFlight(false);
  };

  const handleDeny = async () => {
    const reason = decisionReason.trim();
    if (!reason) return;
    setInFlight(true);
    const result = await decideRescheduleRequest(
      todo.booking_change_request_id,
      "deny",
      reason,
    );
    reportFailure(result, "Couldn't deny that request — try again?");
    if (result?.ok !== false) {
      setDenying(false);
      setDecisionReason("");
    }
    setInFlight(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs leading-relaxed break-words text-slate-700">
        {todo.text}
      </span>
      {todo.done ? (
        <span className="text-[11px] font-semibold text-slate-500">
          Decision recorded
        </span>
      ) : denying ? (
        <div className="flex flex-col gap-2">
          <textarea
            aria-label="Reason for denying request"
            value={decisionReason}
            onChange={(event) => setDecisionReason(event.target.value)}
            maxLength={500}
            rows={2}
            className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDeny}
              disabled={inFlight || !decisionReason.trim()}
              className="portal-btn portal-btn--danger portal-btn--small"
            >
              {inFlight ? "Denying…" : "Confirm denial"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDenying(false);
                setDecisionReason("");
              }}
              disabled={inFlight}
              className="portal-btn portal-btn--secondary portal-btn--small"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Approve reschedule request"
            onClick={handleApprove}
            disabled={inFlight}
            className="portal-btn portal-btn--primary portal-btn--small"
          >
            {inFlight ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            aria-label="Deny reschedule request"
            onClick={() => {
              setDenying(true);
              setDecisionReason("");
            }}
            disabled={inFlight}
            className="portal-btn portal-btn--secondary portal-btn--small"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

export function TodoModal({ onClose }) {
  const toast = useToast();
  const {
    todos,
    loading,
    error,
    addTodo,
    toggleTodo,
    removeTodo,
    moveTodo,
    decideRescheduleRequest,
  } = useTodos();
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const titleId = "todo-modal-title";

  // Thin wrapper so every mutation surface gets a consistent failure
  // toast. Success is silent — the optimistic update is already visible.
  const reportFailure = (result, fallback) => {
    if (result?.ok === false) {
      toast.show(result.error || fallback, "error");
    }
  };

  const handleAdd = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const result = await addTodo(text);
    reportFailure(result, "Couldn't add that — try again?");
    inputRef.current?.focus();
  };

  const handleToggle = async (id) => {
    const result = await toggleTodo(id);
    reportFailure(result, "Couldn't update task — try again?");
  };

  const handleRemove = async (id) => {
    const result = await removeTodo(id);
    reportFailure(result, "Couldn't delete that — try again?");
  };

  const handleMove = async (index, direction) => {
    const result = await moveTodo(index, direction);
    reportFailure(result, "Couldn't move that — try again?");
  };

  return (
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      accent="var(--color-brand-yellow)"
      widthClass="w-[min(480px,95vw)]"
      bodyClassName="p-4"
      rootClassName="bm-fields"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-ink-muted">
              Notes
            </span>
            <h2
              id={titleId}
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1"
            >
              To-Do List
            </h2>
          </div>
          <HeaderIconButton label="Close to-do list" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
    >
      <div>
        <form
          onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
          className="flex gap-1.5 mb-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none placeholder:text-slate-500 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20 transition-colors"
          />
          <button
            type="submit"
            className="tap-target w-8 h-8 rounded-lg bg-brand-teal text-white border-none flex items-center justify-center cursor-pointer transition-all text-lg font-bold hover:bg-brand-teal-dark shrink-0"
          >
            +
          </button>
        </form>

        <InlineError message={error} />

        {loading ? (
          <div className="text-center text-xs text-slate-500 py-3" role="status">Loading...</div>
        ) : todos.length === 0 && !error ? (
          <div className="text-center text-xs text-slate-500 py-3">Nothing yet — add one to get started</div>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {todos.map((todo, i) => (
              <li
                key={todo.id}
                className={`group py-1.5 px-2 rounded-lg transition-colors hover:bg-amber-100/40 ${todo.done ? "opacity-50" : ""}`}
              >
                {todo.kind === "reschedule_request" &&
                todo.booking_change_request_id ? (
                  <RescheduleRequestTodo
                    todo={todo}
                    decideRescheduleRequest={decideRescheduleRequest}
                    reportFailure={reportFailure}
                  />
                ) : (
                  <div className="flex items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggle(todo.id)}
                      aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                      className={`relative w-5 h-5 max-md:w-6 max-md:h-6 rounded border-[1.5px] flex items-center justify-center cursor-pointer transition-all shrink-0 after:absolute after:content-[''] after:-inset-[12px] ${
                        todo.done
                          ? "bg-brand-teal border-brand-teal text-white"
                          : "bg-white border-slate-300 hover:border-brand-teal"
                      }`}
                    >
                      {todo.done && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>

                    <span className={`flex-1 text-xs leading-relaxed break-words ${todo.done ? "line-through text-slate-400" : "text-slate-700"}`}>
                      {todo.text}
                    </span>

                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity shrink-0">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMove(i, -1)}
                          aria-label="Move up"
                          title="Move up"
                          className="tap-target w-8 h-8 max-md:w-9 max-md:h-9 rounded bg-transparent border-none text-slate-400 cursor-pointer flex items-center justify-center hover:text-slate-700 hover:bg-slate-100"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 15l-6-6-6 6" /></svg>
                        </button>
                      )}
                      {i < todos.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMove(i, 1)}
                          aria-label="Move down"
                          title="Move down"
                          className="tap-target w-8 h-8 max-md:w-9 max-md:h-9 rounded bg-transparent border-none text-slate-400 cursor-pointer flex items-center justify-center hover:text-slate-700 hover:bg-slate-100"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemove(todo.id)}
                        aria-label="Delete"
                        title="Delete"
                        className="tap-target w-8 h-8 max-md:w-9 max-md:h-9 rounded bg-transparent border-none text-slate-400 cursor-pointer flex items-center justify-center hover:text-brand-coral hover:bg-brand-coral/10"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}
