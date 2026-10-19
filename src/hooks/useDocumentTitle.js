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
    // The section name needs the normalised path; the resolver normalises the
    // raw path itself, once.
    const section = mount === "staff" ? sectionTitleFor(normaliseTitlePath(pathname)) : null;
    document.title = documentTitleFor(mount, pathname, section, auth);
  }, [mount, pathname, auth]);
}
