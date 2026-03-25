import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.tsx";
import { ToastProvider } from "./hooks/useToast.tsx";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ToastProvider>
      <App />
    </ToastProvider>
  </ErrorBoundary>
);
