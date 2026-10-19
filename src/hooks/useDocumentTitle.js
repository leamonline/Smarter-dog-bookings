// Sets the tab title for the current route (#1004). One call per entrance —
// App, CustomerApp and the reset-password page — never one per view.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { documentTitleFor } from "../routing/documentTitle";
import { sectionTitleFor } from "../components/layout/navConfig.jsx";

/**
 * @param {"staff" | "customer" | "reset-password"} mount
 * @param {"in" | "out" | "denied"} [auth]
 */
export function useDocumentTitle(mount, auth = "in") {
  const { pathname } = useLocation();
  useEffect(() => {
    const section = mount === "staff" ? sectionTitleFor(pathname) : null;
    document.title = documentTitleFor(mount, pathname, section, auth);
  }, [mount, pathname, auth]);
}
