import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";

// ── Primary nav (always visible) ──────────────────────────────────
const PRIMARY_NAV = [
  {
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
    to: "/dogs",
    label: "Dogs",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
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
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
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
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="14" width="4" height="7" rx="1" />
        <rect x="10" y="9" width="4" height="12" rx="1" />
        <rect x="16" y="4" width="4" height="17" rx="1" />
      </svg>
    ),
  },
];

export function AppToolbar({ onSignOut, isOnline, user, weekNav }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <>
      {/* ── Desktop header (xl+) — two-column grid matching main layout ── */}
      <div className="hidden xl:flex gap-5 mb-3 pb-2.5 border-b border-slate-200/60">
        {/* Left column — logo + week dots (above main content) */}
        <div className="flex-1 min-w-0 flex items-center gap-4">
          <NavLink to="/" className="shrink-0 no-underline">
            <img src="/logo.png" alt="Smarter Dog Grooming Salon" className="h-9 w-auto" />
          </NavLink>
          {weekNav && <div className="min-w-0">{weekNav}</div>}
        </div>

        {/* Right column — icon nav + hamburger (above sidebar) */}
        <div className="w-72 shrink-0 flex items-center justify-end gap-1.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 no-underline transition-all ${
                  isActive
                    ? "bg-brand-cyan/10 text-brand-cyan"
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                }`
              }
              title={item.label}
            >
              {item.icon}
              <span className="text-[8px] font-bold leading-none">{item.label}</span>
            </NavLink>
          ))}

          {/* Hamburger — Reports, Settings, Portal, Logout */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className={`w-9 h-9 rounded-lg border-[1.5px] flex items-center justify-center cursor-pointer transition-all ${
                menuOpen
                  ? "border-brand-cyan-dark bg-sky-50 text-brand-cyan-dark"
                  : "border-slate-200 bg-white text-slate-500 hover:border-brand-cyan-dark hover:text-brand-cyan-dark"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
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
        </div>
      </div>

      {/* ── Mobile/tablet top bar (below xl) ── */}
      <div className="xl:hidden mb-4 flex items-center gap-4 pb-3 border-b border-slate-200/60">
        <NavLink to="/" className="shrink-0 no-underline">
          <img src="/logo.png" alt="Smarter Dog Grooming Salon" className="h-8 w-auto" />
        </NavLink>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/settings")}
          aria-label="Settings"
          className={`w-9 h-9 rounded-lg border-[1.5px] flex items-center justify-center cursor-pointer transition-all shrink-0 ${
            location.pathname === "/settings"
              ? "border-brand-cyan-dark bg-sky-50 text-brand-cyan-dark"
              : "border-slate-200 bg-white text-slate-500 hover:border-brand-cyan-dark hover:text-brand-cyan-dark"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <div ref={!menuOpen ? undefined : menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className={`w-9 h-9 rounded-lg border-[1.5px] flex items-center justify-center cursor-pointer transition-all ${
              menuOpen
                ? "border-brand-cyan-dark bg-sky-50 text-brand-cyan-dark"
                : "border-slate-200 bg-white text-slate-500 hover:border-brand-cyan-dark hover:text-brand-cyan-dark"
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
                `flex-1 flex flex-col items-center gap-0.5 py-2 no-underline transition-colors ${
                  isActive ? "text-brand-cyan" : "text-slate-400"
                }`
              }
            >
              {item.icon}
              <span className="text-[10px] font-bold">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
