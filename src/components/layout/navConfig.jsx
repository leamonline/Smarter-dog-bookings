// ── Shared staff navigation config ────────────────────────────────
// One source of truth for the desktop header nav, the mobile icon
// strip, and the context-row section title. Wayfinding is carried by
// the icon + label pair and one uniform active state — the nav is
// quiet chrome, so the day's work below it holds all the colour.
import { DogSilhouette } from "../decor/index.jsx";

// Primary sections — shown in the desktop nav and the mobile strip.
// Settings lives in the tools menu (SETTINGS_ITEM), not the primary nav.
export const PRIMARY_NAV = [
  {
    key: "today",
    to: "/today",
    label: "Daily Brief",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    key: "bookings",
    to: "/",
    label: "Bookings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="9" y1="4" x2="9" y2="10" />
        <line x1="15" y1="4" x2="15" y2="10" />
      </svg>
    ),
  },
  {
    key: "booking-desk",
    to: "/booking-workspace",
    label: "Booking Desk",
    ownerFeature: "booking_workspace_enabled",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2Z" />
        <path d="M9 3v4h6V3" />
        <path d="M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    key: "dogs",
    to: "/dogs",
    label: "Dogs",
    // Uses the brand silhouette via the same CSS-mask technique as
    // FloatingDecor — fills with currentColor so it follows the
    // active/inactive nav colour exactly.
    icon: <DogSilhouette color="currentColor" size={22} ariaHidden />,
  },
  {
    key: "humans",
    to: "/humans",
    label: "Humans",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
  {
    key: "inbox",
    to: "/inbox",
    label: "Inbox",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    key: "reports",
    to: "/reports",
    label: "Reports",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="14" width="4" height="7" rx="1" />
        <rect x="10" y="9" width="4" height="12" rx="1" />
        <rect x="16" y="4" width="4" height="17" rx="1" />
      </svg>
    ),
  },
];

// Settings — reached via the header tools menu / mobile menu sheet.
export const SETTINGS_ITEM = {
  key: "settings",
  to: "/settings",
  label: "Settings",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

// Mobile strip shows the same primary sections as the desktop nav.
export const MOBILE_NAV = PRIMARY_NAV;

// Daily Brief is date-addressable. Keep the configured pathname stable for
// active-state and badge checks, but include the current in-memory selection
// in the rendered destination so entering the page cannot drop that context.
export function navTargetFor(item, currentDateStr) {
  if (item.to === "/today" && currentDateStr) {
    return `/today?date=${currentDateStr}`;
  }
  return item.to;
}

// Which section a path belongs to, as a stable key.
//
// Identity, not presentation. The display titles below can be renamed —
// "Humans" to "People", say — without changing anything keyed on a section,
// which is why behaviour such as the workspace scroll reset keys on this and
// not on the title. Handles profile sub-routes (/dogs/:id, /humans/:id) too:
// they belong to the same section as their list, so opening and closing a
// profile is not a section change.
//
// Covers every section the app can be on, including the ones reached from the
// tools menu rather than the primary nav.
export function sectionKeyFor(pathname) {
  if (pathname.startsWith("/today")) return "today";
  if (pathname.startsWith("/booking-workspace")) return "booking-desk";
  if (pathname === "/" || pathname === "") return "bookings";
  if (pathname.startsWith("/dogs")) return "dogs";
  if (pathname.startsWith("/humans")) return "humans";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/needs-attention")) return "needs-attention";
  return "bookings";
}

const SECTION_TITLES = {
  today: "Daily Brief",
  bookings: "Bookings",
  "booking-desk": "Booking Desk",
  dogs: "Dogs",
  humans: "Humans",
  inbox: "Inbox",
  reports: "Reports",
  settings: "Settings",
  "needs-attention": "Needs Attention",
};

// Resolve the section title for the context row from the current path.
// Derived from the key so a new section cannot gain a title without an
// identity, or drift away from one.
export function sectionTitleFor(pathname) {
  return SECTION_TITLES[sectionKeyFor(pathname)];
}

// Sections whose view manages its own internal scrolling, so the shell must
// not also scroll underneath them. Everything else is a flowing page and
// scrolls in <main>.
const WORKSPACE_SECTIONS = new Set(["bookings"]);

export function sectionScrollsInShell(pathname) {
  return !WORKSPACE_SECTIONS.has(sectionKeyFor(pathname));
}
