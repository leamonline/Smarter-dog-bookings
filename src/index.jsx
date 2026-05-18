import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { supabaseConfigError } from "./supabase/client.js";
import { CustomerUnavailablePage } from "./components/CustomerUnavailablePage.jsx";
import { StaffMisconfiguredPage } from "./components/StaffMisconfiguredPage.jsx";

const App = lazy(() => import("./App.jsx"));
const CustomerApp = lazy(() => import("./CustomerApp.jsx"));
const ResetPasswordPage = lazy(() =>
  import("./components/auth/ResetPasswordPage.jsx").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    {supabaseConfigError ? (
      <Routes>
        <Route path="/customer/*" element={<CustomerUnavailablePage />} />
        <Route path="/*" element={<StaffMisconfiguredPage />} />
      </Routes>
    ) : (
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/customer/*" element={<CustomerApp />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </Suspense>
    )}
  </BrowserRouter>
);
