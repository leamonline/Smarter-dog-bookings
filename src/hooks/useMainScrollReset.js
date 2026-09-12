// src/hooks/useMainScrollReset.js
//
// Sends the workspace back to the top when staff move to a different section.
//
// Until the shell owned its own scrolling, the document scrolled and nothing
// ever reset it: React Router does not scroll on navigation and the app has
// no ScrollToTop. Moving the scrollbar into <main> made that an explicit
// decision rather than an accident, so this is the rule:
//
//   Dogs -> Humans          a different section: back to the top.
//   /dogs/:id -> /dogs      a profile closing: keep the reader's place, which
//                           is most of the point of closing it.
//   ?range=30 -> ?range=90  a filter or a Reports tab: keep the place too.
//
// Hence the key rather than the pathname: sectionKeyFor() maps a profile
// sub-route onto its list, and search parameters are not part of it at all.
// Keying on the section's display title instead would tie scroll behaviour to
// copy, so renaming a nav item would silently change it.

import { useEffect, useRef } from "react";
import { sectionKeyFor } from "../components/layout/navConfig.jsx";

export function useMainScrollReset(ref, pathname) {
  const section = sectionKeyFor(pathname);
  const previous = useRef(section);

  useEffect(() => {
    if (previous.current === section) return;
    previous.current = section;
    // `scrollTop = 0` rather than scrollTo({behavior:"smooth"}): arriving at a
    // new section should feel like a new page, not like being flung up one.
    if (ref.current) ref.current.scrollTop = 0;
  }, [ref, section]);
}
