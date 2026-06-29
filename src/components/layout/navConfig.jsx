// ── Shared staff navigation config ────────────────────────────────
// One source of truth for the desktop header nav, the mobile icon
// strip, and the context-row section title. Each item carries its own
// brand accent so the active pill is instantly recognisable — staff
// don't have to read the label to know where they are.
import { DogSilhouette } from "../decor/index.jsx";

// Primary sections — shown in the desktop nav and the mobile strip.
// Settings lives in the tools menu (SETTINGS_ITEM), not the primary nav.
export const PRIMARY_NAV = [
  {
    to: "/",
    label: "Bookings",
    activeBg: "bg-brand-yellow text-brand-purple shadow-[0_2px_8px_rgba(254,204,19,0.5)]",
    activeText: "text-brand-yellow",
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
    to: "/dogs",
    label: "Dogs",
    activeBg: "bg-brand-cyan text-white shadow-[0_2px_8px_rgba(0,184,224,0.5)]",
    activeText: "text-brand-cyan",
    // Uses the brand silhouette via the same CSS-mask technique as
    // FloatingDecor — fills with currentColor so it follows the
    // active/inactive nav colour exactly.
    icon: <DogSilhouette color="currentColor" size={22} ariaHidden />,
  },
  {
    to: "/humans",
    label: "Humans",
    activeBg: "bg-brand-teal text-white shadow-[0_2px_8px_rgba(45,139,122,0.5)]",
    activeText: "text-brand-teal-light",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
  {
    to: "/inbox",
    label: "Inbox",
    activeBg: "bg-brand-whatsapp text-white shadow-[0_2px_8px_rgba(37,211,102,0.5)]",
    activeText: "text-brand-whatsapp",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    to: "/reports",
    label: "Reports",
    activeBg: "bg-brand-purple-light text-white shadow-[0_2px_8px_rgba(91,61,128,0.5)]",
    activeText: "text-brand-purple-light",
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

// Resolve the section title for the context row from the current path.
// Handles profile sub-routes (/dogs/:id, /humans/:id) too.
export function sectionTitleFor(pathname) {
  if (pathname === "/" || pathname === "") return "Bookings";
  if (pathname.startsWith("/dogs")) return "Dogs";
  if (pathname.startsWith("/humans")) return "Humans";
  if (pathname.startsWith("/inbox")) return "Inbox";
  if (pathname.startsWith("/reports")) return "Cash-up & reports";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Bookings";
}
