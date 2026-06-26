import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Keyboard, UserCircle2, UserPlus } from "lucide-react";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { usePendingSignupsCount } from "../../supabase/hooks/usePendingSignupsCount.js";
import { DogSilhouette } from "../decor/index.jsx";

// ── Primary nav (always visible) ──────────────────────────────────
// Each item carries its own brand accent so the active pill is
// instantly recognisable — staff don't have to read the label to
// know where they are. The mobile tab bar uses the same accents
// for the active text colour.
const PRIMARY_NAV = [
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
    icon: (
      <DogSilhouette color="currentColor" size={22} ariaHidden />
    ),
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
  {
    to: "/settings",
    label: "Settings",
    activeBg: "bg-slate-200 text-brand-purple shadow-[0_2px_8px_rgba(0,0,0,0.12)]",
    activeText: "text-slate-300",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const MOBILE_NAV = PRIMARY_NAV.slice(0, 5);

export function AppToolbar({ onSignOut, isOnline, user, onNewBooking, onNewClient, onOpenOverview }) {
  // openMenu is null | "help" | "account" — only one dropdown is open at a
  // time, and outside-click clears whichever one is showing.
  const [openMenu, setOpenMenu] = useState(null);
  const helpMenuRef = useRef(null);
  const accountMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { unread: waUnread } = useWhatsAppUnread();
  const waBadge = waUnread > 0 ? (waUnread > 99 ? "99+" : String(waUnread)) : null;
  const { count: pendingSignups } = usePendingSignupsCount();
  const humansBadge =
    pendingSignups > 0 ? (pendingSignups > 99 ? "99+" : String(pendingSignups)) : null;

  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e) => {
      const inside =
        helpMenuRef.current?.contains(e.target) ||
        accountMenuRef.current?.contains(e.target) ||
        mobileMenuRef.current?.contains(e.target);
      if (!inside) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenu]);

  return (
    <>
      {/* ── Desktop header (lg+) ── */}
      <div className="hidden lg:flex items-center gap-2 xl:gap-3 mb-4 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-brand-purple text-white rounded-b-2xl shadow-md">
        <NavLink to="/" className="shrink-0 no-underline brightness-0 invert">
          <img src="/logo.png" alt="Smarter Dog Grooming Salon" className="h-9 w-auto" />
        </NavLink>

        {/* Primary nav — sits inline next to the logo to keep the
            right side clear for the + New booking CTA. */}
        <nav className="flex items-center gap-1 ml-3" aria-label="Primary">
          {PRIMARY_NAV.map((item) => {
            const ariaLabel =
              item.to === "/inbox" && waUnread > 0
                ? `${item.label} — ${waUnread > 99 ? "99 plus" : waUnread} unread`
                : item.to === "/humans" && pendingSignups > 0
                  ? `${item.label} — ${pendingSignups > 99 ? "99 plus" : pendingSignups} new ${pendingSignups === 1 ? "customer" : "customers"} awaiting approval`
                  : item.label;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                aria-label={ariaLabel}
                className={({ isActive }) =>
                  `group relative inline-flex items-center gap-1.5 h-10 px-3 rounded-xl no-underline transition-all duration-150 ${
                    isActive
                      ? `${item.activeBg} font-bold`
                      : "bg-white/[0.06] text-white/85 hover:bg-white/15 hover:text-white font-semibold"
                  }`
                }
                title={item.label}
              >
                <span className="transition-transform duration-150 group-hover:scale-110 shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="text-sm leading-none tracking-tight">
                  {item.label}
                </span>
                {item.to === "/inbox" && waBadge && (
                  <span
                    className="ml-0.5 min-w-[20px] h-[18px] px-1 rounded-full bg-brand-coral text-white text-[10px] font-black flex items-center justify-center leading-none shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                    aria-hidden="true"
                  >
                    {waBadge}
                  </span>
                )}
                {item.to === "/humans" && humansBadge && (
                  <span
                    className="ml-0.5 min-w-[20px] h-[18px] px-1 rounded-full bg-brand-yellow text-brand-purple text-[10px] font-black flex items-center justify-center leading-none shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                    aria-hidden="true"
                  >
                    {humansBadge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Primary CTA — + New booking. Mustard on purple, the loudest
            action available anywhere on the dashboard. */}
        {onNewBooking && (
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-bold bg-brand-yellow text-brand-purple cursor-pointer transition-all hover:bg-brand-yellow-dark hover:-translate-y-0.5 shadow-cta-yellow font-[inherit] focus-visible:outline-2 focus-visible:outline-brand-purple focus-visible:outline-offset-2"
            aria-label="New booking (press N)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="xl:hidden">New</span>
            <span className="hidden xl:inline">New booking</span>
          </button>
        )}

        {/* Secondary CTA — set up a brand-new customer + dog(s) + first
            booking in one guided wizard. */}
        {onNewClient && (
          <button
            type="button"
            onClick={onNewClient}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-bold bg-white/10 text-white cursor-pointer transition-all hover:bg-white/20 font-[inherit] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            aria-label="New client"
          >
            <UserPlus size={16} strokeWidth={2.4} aria-hidden="true" />
            <span className="hidden xl:inline">New client</span>
          </button>
        )}

        {/* Help / shortcuts — keyboard-only reference. Split from the
            account menu so users don't have to learn that shortcuts live
            under "Account" to find them. */}
        <div ref={helpMenuRef} className="relative">
          <button
            onClick={() => setOpenMenu((m) => (m === "help" ? null : "help"))}
            aria-label="Keyboard shortcuts"
            aria-expanded={openMenu === "help"}
            aria-haspopup="true"
            title="Keyboard shortcuts"
            className={`tap-target w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
              openMenu === "help"
                ? "bg-brand-yellow text-brand-purple"
                : "bg-white/[0.06] text-white/85 hover:bg-white/15 hover:text-white"
            }`}
          >
            <Keyboard size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>

          {openMenu === "help" && (
            <div
              role="region"
              aria-label="Keyboard shortcuts"
              className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[220px] overflow-hidden animate-[fadeIn_0.12s_ease-out] p-4"
            >
              <div className="text-label text-ink-muted mb-2">Shortcuts</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600">
                <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">N</kbd><span>New booking</span>
                <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">T</kbd><span>Jump to today</span>
                <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">&larr; &rarr;</kbd><span>Navigate weeks</span>
              </div>
            </div>
          )}
        </div>

        {/* Account menu — Customer Portal + Log out. Single concern:
            the user's identity and where they sign in/out. */}
        <div ref={accountMenuRef} className="relative">
          <button
            onClick={() => setOpenMenu((m) => (m === "account" ? null : "account"))}
            aria-label="Account menu"
            aria-expanded={openMenu === "account"}
            aria-haspopup="menu"
            title="Account"
            className={`tap-target w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
              openMenu === "account"
                ? "bg-brand-yellow text-brand-purple"
                : "bg-white/[0.06] text-white/85 hover:bg-white/15 hover:text-white"
            }`}
          >
            <UserCircle2 size={20} strokeWidth={2} aria-hidden="true" />
          </button>

          {openMenu === "account" && (
            <div className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[220px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
              <a
                href="/customer"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenMenu(null)}
                className="flex items-center gap-2.5 w-full px-4 py-3 no-underline text-sm font-semibold text-brand-purple hover:bg-slate-50 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-brand-teal"><ellipse cx="8" cy="7" rx="2.5" ry="3" /><ellipse cx="16" cy="7" rx="2.5" ry="3" /><ellipse cx="4.5" cy="13" rx="2" ry="2.5" /><ellipse cx="19.5" cy="13" rx="2" ry="2.5" /><ellipse cx="12" cy="17" rx="5" ry="4" /></svg>
                Customer Portal
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-slate-400">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>

              {isOnline && user && (
                <>
                  <div className="h-px bg-slate-200 mx-3" />
                  <button
                    onClick={() => { onSignOut(); setOpenMenu(null); }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-coral bg-transparent hover:bg-brand-coral-light transition-colors text-left font-[inherit]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    Log out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile/tablet top bar (below lg) — compact like a tablet app toolbar ── */}
      <div className="lg:hidden mb-3 -mx-4 sm:-mx-6 px-3 sm:px-5 py-2 flex items-center gap-2 bg-brand-purple text-white rounded-b-2xl shadow-md">
        <NavLink to="/" className="shrink-0 no-underline brightness-0 invert">
          <img src="/logo.png" alt="Smarter Dog Grooming Salon" className="h-7 w-auto" />
        </NavLink>
        {onOpenOverview && (
          <button
            type="button"
            onClick={onOpenOverview}
            aria-label="Open overview"
            className="hidden md:inline-flex items-center gap-1 h-9 px-3 rounded-full text-xs font-semibold text-white/90 bg-white/10 hover:bg-white/20 cursor-pointer transition-colors font-[inherit] shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="9" y1="4" x2="9" y2="10" />
              <line x1="15" y1="4" x2="15" y2="10" />
            </svg>
            Overview
          </button>
        )}
        <div className="flex-1" />
        {onNewBooking && (
          <button
            type="button"
            onClick={onNewBooking}
            aria-label="New booking"
            className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-xs font-bold bg-brand-yellow text-brand-purple cursor-pointer transition-all hover:bg-brand-yellow-dark shadow-cta-yellow font-[inherit] focus-visible:outline-2 focus-visible:outline-brand-purple focus-visible:outline-offset-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="hidden sm:inline">New booking</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
        {onNewClient && (
          <button
            type="button"
            onClick={onNewClient}
            aria-label="New client"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white cursor-pointer transition-all hover:bg-white/20 shrink-0 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
          >
            <UserPlus size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
        <button
          onClick={() => navigate("/settings")}
          aria-label="Settings"
          className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 ${
            location.pathname === "/settings"
              ? "bg-brand-yellow text-brand-purple"
              : "text-white/80 hover:bg-white/10"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <div ref={mobileMenuRef} className="relative shrink-0">
          <button
            onClick={() => setOpenMenu((m) => (m === "account" ? null : "account"))}
            aria-label="Account menu"
            aria-expanded={openMenu === "account"}
            aria-haspopup="menu"
            className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all ${
              openMenu === "account"
                ? "bg-brand-yellow text-brand-purple"
                : "text-white/80 hover:bg-white/10"
            }`}
          >
            <UserCircle2 size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          {openMenu === "account" && (
            <div className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[180px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
              <a href="/customer" target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenu(null)}
                className="flex items-center gap-2.5 w-full px-4 py-3 no-underline text-sm font-semibold text-brand-purple hover:bg-slate-50 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-brand-teal"><ellipse cx="8" cy="7" rx="2.5" ry="3" /><ellipse cx="16" cy="7" rx="2.5" ry="3" /><ellipse cx="4.5" cy="13" rx="2" ry="2.5" /><ellipse cx="19.5" cy="13" rx="2" ry="2.5" /><ellipse cx="12" cy="17" rx="5" ry="4" /></svg>
                Customer Portal
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-slate-400">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
              {isOnline && user && (
                <>
                  <div className="h-px bg-slate-200 mx-3" />
                  <button onClick={() => { onSignOut(); setOpenMenu(null); }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-coral bg-transparent hover:bg-brand-coral-light transition-colors text-left font-[inherit]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    Log out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile/tablet bottom tab bar (below lg) ── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="flex max-w-xl mx-auto">
          {MOBILE_NAV.map((item) => {
            const ariaLabel =
              item.to === "/inbox" && waUnread > 0
                ? `${item.label} — ${waUnread > 99 ? "99 plus" : waUnread} unread`
                : item.to === "/humans" && pendingSignups > 0
                  ? `${item.label} — ${pendingSignups > 99 ? "99 plus" : pendingSignups} new ${pendingSignups === 1 ? "customer" : "customers"} awaiting approval`
                  : item.label;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                aria-label={ariaLabel}
                className={({ isActive }) =>
                  `relative flex-1 flex flex-col items-center gap-1 py-2 no-underline transition-colors ${
                    isActive ? item.activeText : "text-slate-500 hover:text-slate-700"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute top-0 w-8 h-0.5 rounded-b-full transition-all ${
                        isActive ? `${item.activeText.replace("text-", "bg-")}` : "bg-transparent"
                      }`}
                      aria-hidden="true"
                    />
                    {item.icon}
                    <span className="text-[10px] font-bold">{item.label}</span>
                    {item.to === "/inbox" && waBadge && (
                      <span
                        className="absolute top-1 right-[calc(50%-20px)] min-w-[16px] h-[16px] px-1 rounded-full bg-brand-coral text-white text-[9px] font-bold flex items-center justify-center leading-none"
                        aria-hidden="true"
                      >
                        {waBadge}
                      </span>
                    )}
                    {item.to === "/humans" && humansBadge && (
                      <span
                        className="absolute top-1 right-[calc(50%-20px)] min-w-[16px] h-[16px] px-1 rounded-full bg-brand-yellow text-brand-purple text-[9px] font-bold flex items-center justify-center leading-none"
                        aria-hidden="true"
                      >
                        {humansBadge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
