// Sets the tab title for the current route (#1004). One call per entrance —
// App, CustomerApp and the reset-password page — never one per view.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { documentTitleFor, normaliseTitlePath } from "../routing/documentTitle";
import { sectionTitleFor } from "../components/layout/navConfig.jsx";

/**
 * @param {"staff" | "customer" | "reset-password"} mount
 * @param {import("../routing/documentTitle").TitleAuth} [auth]
 */
export function useDocumentTitle(mount, auth = "in") {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = normaliseTitlePath(pathname);
    const section = mount === "staff" ? sectionTitleFor(path) : null;
    document.title = documentTitleFor(mount, path, section, auth);
  }, [mount, pathname, auth]);
}
