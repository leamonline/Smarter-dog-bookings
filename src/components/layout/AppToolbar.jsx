import { useState, useRef, useEffect } from "react";

// ── Nav items ───────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    key: "dashboard",
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
    key: "dogs",
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
    key: "humans",
    label: "Humans",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
  {
    key: "stats",
    label: "Stats",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="14" width="4" height="7" rx="1" />
        <rect x="10" y="9" width="4" height="12" rx="1" />
        <rect x="16" y="4" width="4" height="17" rx="1" />
      </svg>
    ),
  },
];

// ── Menu items (hamburger dropdown) ─────────────────────────────
const MENU_ITEMS = [
  { key: "reports", label: "Reports", icon: "📊" },
  { key: "settings", label: "Settings", icon: "⚙️" },
  { key: "customer-portal", label: "Customer Portal", icon: "🐾", href: "/customer" },
];

export function AppToolbar({
  activeView,
  setActiveView,
  onSignOut,
  isOnline,
  user,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isMenuViewActive = activeView === "reports" || activeView === "settings";

  return (
    <>
      {/* ── Desktop top bar (md+) + Mobile slim top bar ── */}
      <div className="mb-4 flex items-center gap-4 pb-3 border-b border-slate-200/60">
        {/* Logo */}
        <div
          className="shrink-0 cursor-pointer"
          onClick={() => setActiveView("dashboard")}
        >
          <div className="text-2xl font-extrabold text-slate-800">
            Smarter<span className="text-brand-cyan">Dog</span>
          </div>
        </div>

        {/* Desktop nav tabs — hidden on mobile */}
        <div className="hidden md:flex gap-0.5 bg-slate-100 p-1 rounded-lg shrink min-w-0">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition-all border-none cursor-pointer whitespace-nowrap font-[inherit] ${
                  isActive
                    ? "bg-white text-brand-cyan shadow-sm"
                    : "bg-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Hamburger menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className={`w-9 h-9 rounded-lg border-[1.5px] flex items-center justify-center cursor-pointer transition-all text-lg font-[inherit] ${
              menuOpen || isMenuViewActive
                ? "border-brand-cyan-dark bg-sky-50 text-brand-cyan-dark"
                : "border-slate-200 bg-white text-slate-500 hover:border-brand-cyan-dark hover:text-brand-cyan-dark"
            }`}
          >
            ☰
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
              {MENU_ITEMS.map((item) => {
                if (item.href) {
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 w-full px-4 py-3 no-underline cursor-pointer text-sm text-left transition-colors font-[inherit] font-semibold text-slate-800 bg-transparent hover:bg-slate-50"
                    >
                      <span className="text-base">{item.icon}</span>
                      {item.label}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-slate-400">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  );
                }
                const isActive = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { setActiveView(item.key); setMenuOpen(false); }}
                    className={`flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm text-left transition-colors font-[inherit] ${
                      isActive
                        ? "font-bold text-brand-cyan-dark bg-sky-50"
                        : "font-semibold text-slate-800 bg-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}

              <div className="hidden md:block">
                <div className="h-px bg-slate-200 mx-3" />
                <div className="px-4 py-2.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Shortcuts</div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-500">
                    <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">N</kbd><span>New booking</span>
                    <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">T</kbd><span>Jump to today</span>
                    <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">&larr; &rarr;</kbd><span>Navigate weeks</span>
                  </div>
                </div>
              </div>

              {isOnline && user && (
                <>
                  <div className="h-px bg-slate-200 mx-3" />
                  <button
                    onClick={() => { onSignOut(); setMenuOpen(false); }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-coral bg-transparent hover:bg-brand-coral-light transition-colors text-left font-[inherit]"
                  >
                    <span className="text-base">🚪</span>
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
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 border-none cursor-pointer bg-transparent font-[inherit] transition-colors ${
                  isActive ? "text-brand-cyan" : "text-slate-400"
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-bold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
