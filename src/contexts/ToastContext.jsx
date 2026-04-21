/**
 * ToastContext — lightweight toast notification system.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.show("Booking saved");                       // default (info)
 *   toast.show("Removed from waitlist", "success");    // success variant
 *   toast.show("Could not save", "error");             // error variant
 *   toast.show("Seat blocked", "info", undoFn);        // with undo action
 */
import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

const TOAST_DURATION = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, variant = "info", onUndo) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant, onUndo }]);

    setTimeout(() => dismiss(id), TOAST_DURATION);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ── Toaster (renders the toast stack) ────────────────────────────── */

const VARIANT_STYLES = {
  info: "bg-slate-800 text-white",
  success: "bg-brand-teal text-white",
  error: "bg-brand-coral text-white",
};

function Toaster({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  // Split so error toasts can live in an assertive live region
  // (interrupting other announcements) while info/success stay polite.
  const errorToasts = toasts.filter((t) => t.variant === "error");
  const politeToasts = toasts.filter((t) => t.variant !== "error");

  const renderToast = (t) => (
    <div
      key={t.id}
      role={t.variant === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold animate-[toastIn_0.25s_ease-out] ${VARIANT_STYLES[t.variant] || VARIANT_STYLES.info}`}
    >
      <span>{t.message}</span>

      {t.onUndo && (
        <button
          type="button"
          onClick={() => { t.onUndo(); onDismiss(t.id); }}
          className="bg-white/20 hover:bg-white/30 text-inherit border-none rounded-md px-2 py-0.5 text-xs font-bold cursor-pointer transition-colors"
        >
          Undo
        </button>
      )}

      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        className="bg-transparent border-none text-white/60 hover:text-white cursor-pointer text-base leading-none ml-1"
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  );

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[2000] flex flex-col gap-2 pointer-events-none">
      <div aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
        {politeToasts.map(renderToast)}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="flex flex-col gap-2">
        {errorToasts.map(renderToast)}
      </div>
    </div>
  );
}

