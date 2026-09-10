import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import { OverlayProvider } from "react-aria";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { supabaseConfigError } from "./supabase/client";
import { CustomerUnavailablePage } from "./components/CustomerUnavailablePage.jsx";
import { StaffMisconfiguredPage } from "./components/StaffMisconfiguredPage.jsx";
import { initSentry } from "./lib/sentry.js";
import { installChunkReloadHandler } from "./lib/chunkReload.js";
import { resolveLegacyRedirect, resolveMount } from "./routing/entrypoints";

initSentry();
installChunkReloadHandler();

const App = lazy(() => import("./App.jsx"));
const CustomerApp = lazy(() => import("./CustomerApp.jsx"));
const ResetPasswordPage = lazy(() =>
  import("./components/auth/ResetPasswordPage.jsx").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);

const { pathname, search, hash } = window.location;
const legacyRedirect = resolveLegacyRedirect(pathname);

if (legacyRedirect) {
  // An old /customer or bare staff URL. Vercel serves the same redirect, so
  // this mostly catches links already open in a browser. replace() rather than
  // assign() so Back doesn't bounce straight off the old URL again.
  window.location.replace(`${legacyRedirect}${search}${hash}`);
} else {
  // resolveLegacyRedirect returns null only for paths resolveMount can place,
  // which entrypoints.test.ts pins.
  const { mount, basename } = resolveMount(pathname);

  const screen = () => {
    if (supabaseConfigError) {
      return mount === "customer" ? (
        <CustomerUnavailablePage />
      ) : (
        <StaffMisconfiguredPage />
      );
    }
    if (mount === "reset-password") return <ResetPasswordPage />;
    return mount === "customer" ? <CustomerApp /> : <App />;
  };

  // One router per entrance, each with its own basename: that is what lets the
  // absolute paths inside both apps ("/today", "/dogs/:id") stay as they are.
  createRoot(document.getElementById("root")).render(
    <BrowserRouter basename={basename}>
      <OverlayProvider>
        <Suspense fallback={<LoadingSpinner />}>{screen()}</Suspense>
      </OverlayProvider>
    </BrowserRouter>,
  );
}
