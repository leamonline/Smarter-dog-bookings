import { createContext, useContext, useState, useCallback } from "react";

type ToastType = "success" | "error";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

type ShowToastFn = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ShowToastFn | null>(null);

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback<ShowToastFn>((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToastFn | null {
  return useContext(ToastContext);
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 10000,
        display: "flex", flexDirection: "column", gap: 8, maxWidth: 360,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: "12px 16px", borderRadius: 10,
            background: toast.type === "error" ? "#FEE2E2" : "#ECFDF5",
            border: `1px solid ${toast.type === "error" ? "#F87171" : "#6EE7B7"}`,
            color: toast.type === "error" ? "#991B1B" : "#065F46",
            fontSize: 13, fontWeight: 600,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            display: "flex", alignItems: "center", gap: 8,
            animation: "slideIn 0.2s ease-out",
          }}
        >
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 16, color: "inherit", padding: 0, lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
