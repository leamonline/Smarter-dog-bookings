import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";

const App = lazy(() => import("./App.jsx"));
const CustomerApp = lazy(() => import("./CustomerApp.jsx"));
const ResetPasswordPage = lazy(() =>
  import("./components/auth/ResetPasswordPage.jsx").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/customer/*" element={<CustomerApp />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);
