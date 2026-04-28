import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";

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
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="7.5" cy="5.5" r="2" />
        <circle cx="16.5" cy="5.5" r="2" />
        <circle cx="5" cy="11" r="1.8" />
        <circle cx="19" cy="11" r="1.8" />
        <ellipse cx="12" cy="14" rx="5" ry="4.5" />
      </svg>
    ),
  },
  {
    to: "/humans",
    label: "Humans",
    activeBg: "bg-[#2D8B7A] text-white shadow-[0_2px_8px_rgba(45,139,122,0.5)]",
    activeText: "text-[#3BA594]",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
  {
    to: "/whatsapp",
    label: "WhatsApp",
    activeBg: "bg-[#25D366] text-white shadow-[0_2px_8px_rgba(37,211,102,0.5)]",
    activeText: "text-[#25D366]",
    // Generic speech-bubble; intentionally not the WhatsApp green logo
    // (trademark) — the path tells staff where they are, not the brand.
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
];

// ── All mobile bottom tab items (includes Reports) ────────────────
const MOBILE_NAV = [
  ...PRIMARY_NAV,
  {
    to: "/reports",
    label: "Reports",
    activeBg: "bg-brand-purple text-white",
    activeText: "text-brand-purple",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="14" width="4" height="7" rx="1" />
        <rect x="10" y="9" width="4" height="12" rx="1" />
        <rect x="16" y="4" width="4" height="17" rx="1" />
      </svg>
    ),
  },
];

export function AppToolbar({ onSignOut, isOnline, user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Two refs, one per toolbar variant (desktop xl+ / mobile below xl).
  // Both variants are always mounted — one is hidden via Tailwind breakpoints,
  // not unmounted — so a single shared ref gets last-write-wins overwritten
  // and the outside-click detector ends up checking the wrong DOM subtree.
  const desktopMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Surfaces new customer messages without forcing staff to click into
  // the inbox. Only rendered on the WhatsApp item; capped at 99+ so it
  // never stretches the nav layout.
  const { unread: waUnread } = useWhatsAppUnread();
  const waBadge = waUnread > 0 ? (waUnread > 99 ? "99+" : String(waUnread)) : null;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      // Close only if the click landed outside BOTH variants. Checking just
      // one false-positives on whichever variant is currently display:none.
      const insideDesktop = desktopMenuRef.current?.contains(e.target);
      const insideMobile = mobileMenuRef.current?.contains(e.target);
      if (!insideDesktop && !insideMobile) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <>
      {/* ── Desktop header (xl+) — deep-purple brand band, full-bleed via -mx ── */}
      <div className="hidden xl:flex items-center gap-4 mb-4 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-brand-purple text-white rounded-b-2xl shadow-md">
        {/* Logo */}
        <NavLink to="/" className="shrink-0 no-underline brightness-0 invert">
          <img src="/logo.png" alt="Smarter Dog Grooming Salon" className="h-9 w-auto" />
        </NavLink>

        {/* Spacer pushes nav to the right */}
        <div className="flex-1" />

        {/* Primary nav — text+icon pills, each carries its section's
            accent colour when active so the current section reads at
            a glance without staff having to scan the labels. */}
        <nav className="flex items-center gap-1.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `group relative inline-flex items-center gap-2 h-10 px-3.5 rounded-xl no-underline transition-all duration-150 ${
                  isActive
                    ? `${item.activeBg} font-bold`
                    : "bg-white/[0.06] text-white/85 hover:bg-white/15 hover:text-white font-semibold"
                }`
              }
              title={item.label}
            >
              <span className="transition-transform duration-150 group-hover:scale-110 shrink-0">
                {item.icon}
              </span>
              <span className="text-sm leading-none tracking-tight">{item.label}</span>
              {item.to === "/whatsapp" && waBadge && (
                <span className="ml-0.5 min-w-[20px] h-[18px] px-1 rounded-full bg-brand-coral text-white text-[10px] font-black flex items-center justify-center leading-none shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
                  {waBadge}
                </span>
              )}
            </NavLink>
          ))}

          {/* Vertical divider between primary nav and the burger */}
          <span className="w-px h-6 bg-white/15 mx-1" aria-hidden="true" />

          {/* Hamburger — Reports, Settings, Portal, Logout */}
          <div ref={desktopMenuRef} className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                menuOpen
                  ? "bg-brand-yellow text-brand-purple"
                  : "bg-white/[0.06] text-white/85 hover:bg-white/15 hover:text-white"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
            </button>

            {menuOpen && (
              <div className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[200px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
                <NavLink
                  to="/reports"
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 w-full px-4 py-3 no-underline text-sm font-semibold transition-colors ${
                      isActive ? "text-brand-cyan bg-sky-50" : "text-slate-800 hover:bg-slate-50"
                    }`
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="4" y="14" width="4" height="7" rx="1" /><rect x="10" y="9" width="4" height="12" rx="1" /><rect x="16" y="4" width="4" height="17" rx="1" /></svg>
                  Reports
                </NavLink>

                <div className="h-px bg-slate-200 mx-3" />

                <button
                  onClick={() => { navigate("/settings"); setMenuOpen(false); }}
                  className={`flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold transition-colors text-left font-[inherit] ${
                    location.pathname === "/settings" ? "text-brand-cyan bg-sky-50" : "text-slate-800 bg-transparent hover:bg-slate-50"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </button>

                <div className="h-px bg-slate-200 mx-3" />

                <a
                  href="/customer"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-4 py-3 no-underline text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-brand-cyan"><ellipse cx="8" cy="7" rx="2.5" ry="3" /><ellipse cx="16" cy="7" rx="2.5" ry="3" /><ellipse cx="4.5" cy="13" rx="2" ry="2.5" /><ellipse cx="19.5" cy="13" rx="2" ry="2.5" /><ellipse cx="12" cy="17" rx="5" ry="4" /></svg>
                  Customer Portal
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-slate-400">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>

                <div className="px-4 py-2.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Shortcuts</div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-500">
                    <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">N</kbd><span>New booking</span>
                    <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">T</kbd><span>Jump to today</span>
                    <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">&larr; &rarr;</kbd><span>Navigate weeks</span>
                  </div>
                </div>

                {isOnline && user && (
                  <>
                    <div className="h-px bg-slate-200 mx-3" />
                    <button
                      onClick={() => { onSignOut(); setMenuOpen(false); }}
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
        </nav>
      </div>

      {/* ── Mobile/tablet top bar (below xl) ── */}
      <div className="xl:hidden mb-4 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 flex items-center gap-3 bg-brand-purple text-white rounded-b-2xl shadow-md">
        <NavLink to="/" className="shrink-0 no-underline brightness-0 invert">
          <img src="/logo.png" alt="Smarter Dog Grooming Salon" className="h-8 w-auto" />
        </NavLink>
        <div className="flex-1" />
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
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all ${
              menuOpen
                ? "bg-brand-yellow text-brand-purple"
                : "text-white/80 hover:bg-white/10"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
          </button>
          {menuOpen && (
            <div className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[180px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
              <a href="/customer" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 w-full px-4 py-3 no-underline text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-brand-cyan"><ellipse cx="8" cy="7" rx="2.5" ry="3" /><ellipse cx="16" cy="7" rx="2.5" ry="3" /><ellipse cx="4.5" cy="13" rx="2" ry="2.5" /><ellipse cx="19.5" cy="13" rx="2" ry="2.5" /><ellipse cx="12" cy="17" rx="5" ry="4" /></svg>
                Customer Portal
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-slate-400">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
              {isOnline && user && (
                <>
                  <div className="h-px bg-slate-200 mx-3" />
                  <button onClick={() => { onSignOut(); setMenuOpen(false); }}
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

      {/* ── Mobile bottom tab bar (below md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `relative flex-1 flex flex-col items-center gap-1 py-2 no-underline transition-colors ${
                  isActive ? item.activeText : "text-slate-400 hover:text-slate-600"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active dot above the icon — gives the tab bar a
                      visual anchor that's clearer than colour alone. */}
                  <span
                    className={`absolute top-0 w-8 h-0.5 rounded-b-full transition-all ${
                      isActive ? `${item.activeText.replace("text-", "bg-")}` : "bg-transparent"
                    }`}
                    aria-hidden="true"
                  />
                  {item.icon}
                  <span className="text-[10px] font-bold">{item.label}</span>
                  {item.to === "/whatsapp" && waBadge && (
                    <span className="absolute top-1 right-[calc(50%-20px)] min-w-[16px] h-[16px] px-1 rounded-full bg-brand-coral text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {waBadge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
