import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, UserPlus, Settings as SettingsIcon, LogOut, ExternalLink, ClipboardList } from "lucide-react";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread";
import { usePendingSignupsCount } from "../../supabase/hooks/usePendingSignupsCount";
import { navTargetFor, PRIMARY_NAV } from "./navConfig.jsx";

// Two-letter initials for the account avatar — prefers a display name,
// falls back to the email local-part. Empty string → generic glyph.
function initialsFromUser(user) {
  const name = user?.user_metadata?.full_name || user?.name;
  const src = name || (user?.email || "").split("@")[0];
  const parts = (src || "").split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// The wordmark as brand-purple ink on the light bar — /app/logo.png is a
// black-on-transparent lockup, so a CSS mask recolours it to match the
// chrome exactly (same technique as DogSilhouette). Source is 4:1, so
// keep width = 4 × height for a crisp `contain` fit.
function BrandWordmark({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`block bg-brand-purple ${className}`}
      style={{
        WebkitMaskImage: "url(/app/logo.png)",
        maskImage: "url(/app/logo.png)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "left center",
        maskPosition: "left center",
      }}
    />
  );
}

const PawIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-brand-teal" aria-hidden="true">
    <ellipse cx="8" cy="7" rx="2.5" ry="3" /><ellipse cx="16" cy="7" rx="2.5" ry="3" /><ellipse cx="4.5" cy="13" rx="2" ry="2.5" /><ellipse cx="19.5" cy="13" rx="2" ry="2.5" /><ellipse cx="12" cy="17" rx="5" ry="4" />
  </svg>
);

export function AppToolbar({ onSignOut, isOnline, user, onNewBooking, onNewClient, onOpenOverview, currentDateStr, showBookingWorkspace = false }) {
  // openMenu is null | "tools" | "account" | "mobile" — only one dropdown
  // is open at a time, and outside-click clears whichever one is showing.
  const [openMenu, setOpenMenu] = useState(null);
  const toolsMenuRef = useRef(null);
  const accountMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const navigate = useNavigate();
  const { unread: waUnread } = useWhatsAppUnread();
  const waBadge = waUnread > 0 ? (waUnread > 99 ? "99+" : String(waUnread)) : null;
  const { count: pendingSignups } = usePendingSignupsCount();
  const humansBadge =
    pendingSignups > 0 ? (pendingSignups > 99 ? "99+" : String(pendingSignups)) : null;
  const initials = initialsFromUser(user);

  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e) => {
      const inside =
        toolsMenuRef.current?.contains(e.target) ||
        accountMenuRef.current?.contains(e.target) ||
        mobileMenuRef.current?.contains(e.target);
      if (!inside) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenu]);

  return (
    <>
      {/* ── Desktop header (lg+) ──
          Quiet chrome: white surface, hairline rule, ink typography. The
          nav frames the work rather than competing with it — the only
          saturated colour up here is signal (badges, the one CTA). */}
      <div className="hidden lg:flex items-center gap-2 -mx-[var(--app-gutter)] px-[var(--app-gutter)] py-2 bg-white text-slate-700 border-b border-slate-200">
        <NavLink to="/" className="shrink-0 no-underline" aria-label="Smarter Dog home">
          <BrandWordmark className="h-7 w-28" />
        </NavLink>

        {/* Primary nav — sits inline next to the logo to keep the right
            side clear for the New booking CTA. One uniform active state;
            the icon + label pair does the wayfinding. */}
        <nav className="flex items-center gap-0.5 ml-1 xl:ml-2" aria-label="Primary">
          {PRIMARY_NAV.filter(
            (item) => !item.ownerFeature || showBookingWorkspace,
          ).map((item) => {
            const ariaLabel =
              item.to === "/inbox" && waUnread > 0
                ? `${item.label} — ${waUnread > 99 ? "99 plus" : waUnread} to reply`
                : item.to === "/humans" && pendingSignups > 0
                  ? `${item.label} — ${pendingSignups > 99 ? "99 plus" : pendingSignups} new ${pendingSignups === 1 ? "customer" : "customers"} awaiting approval`
                  : item.label;
            return (
              <NavLink
                key={item.to}
                to={navTargetFor(item, currentDateStr)}
                end={item.to === "/"}
                aria-label={ariaLabel}
                className={({ isActive }) =>
                  `group relative inline-flex shrink-0 items-center gap-1 h-10 px-0.5 xl:px-2.5 rounded-xl no-underline transition-all duration-150 ${
                    isActive
                      ? "bg-brand-purple/[0.07] text-brand-purple font-bold"
                      : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-brand-purple font-semibold"
                  }`
                }
                title={item.label}
              >
                <span className="transition-transform duration-150 group-hover:scale-110 shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="whitespace-nowrap text-[13px] leading-none tracking-tight xl:text-sm">{item.label}</span>
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

        {/* Primary CTA — New booking. The one filled control in the bar:
            solid purple, no glow, so the board below keeps gold for "the
            next thing to do". */}
        {onNewBooking && (
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex shrink-0 items-center gap-1.5 h-10 px-4 rounded-full text-sm font-bold whitespace-nowrap bg-brand-purple text-white cursor-pointer transition-colors hover:bg-brand-purple-light font-[inherit] focus-visible:outline-2 focus-visible:outline-brand-purple focus-visible:outline-offset-2"
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
            booking in one guided wizard. Quieter than New booking. */}
        {onNewClient && (
          <button
            type="button"
            onClick={onNewClient}
            className="inline-flex shrink-0 items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-bold whitespace-nowrap border border-slate-200 bg-white text-slate-700 cursor-pointer transition-colors hover:border-brand-purple/30 hover:text-brand-purple font-[inherit] focus-visible:outline-2 focus-visible:outline-brand-purple focus-visible:outline-offset-2"
            aria-label="New client"
          >
            <UserPlus size={16} strokeWidth={2.4} aria-hidden="true" />
            <span className="hidden xl:inline">Client</span>
          </button>
        )}

        {/* Tools & settings — quieter menu holding Settings + the
            keyboard-shortcuts reference. */}
        <div ref={toolsMenuRef} className="relative">
          <button
            onClick={() => setOpenMenu((m) => (m === "tools" ? null : "tools"))}
            aria-label="Tools and settings"
            aria-expanded={openMenu === "tools"}
            aria-haspopup="menu"
            title="Tools and settings"
            className={`tap-target w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
              openMenu === "tools"
                ? "bg-slate-100 text-brand-purple"
                : "text-slate-500 hover:bg-slate-100 hover:text-brand-purple"
            }`}
          >
            <Menu size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>

          {openMenu === "tools" && (
            <div
              role="menu"
              aria-label="Tools and settings"
              className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[230px] overflow-hidden animate-[fadeIn_0.12s_ease-out]"
            >
              <button
                onClick={() => { navigate("/needs-attention"); setOpenMenu(null); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-purple bg-transparent hover:bg-slate-50 transition-colors text-left font-[inherit]"
              >
                <ClipboardList size={16} strokeWidth={2.2} className="shrink-0 text-slate-500" aria-hidden="true" />
                Needs Attention
              </button>
              <button
                onClick={() => { navigate("/settings"); setOpenMenu(null); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-purple bg-transparent hover:bg-slate-50 transition-colors text-left font-[inherit]"
              >
                <SettingsIcon size={16} strokeWidth={2.2} className="shrink-0 text-slate-500" aria-hidden="true" />
                Settings
              </button>
              <div className="h-px bg-slate-200 mx-3" />
              <div className="px-4 py-3">
                <div className="text-label text-ink-muted mb-2">Handy shortcuts</div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600">
                  <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">N</kbd><span>New booking</span>
                  <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">T</kbd><span>Jump to today</span>
                  <kbd className="bg-slate-100 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">&larr; &rarr;</kbd><span>Move between weeks</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Account — the user's identity, the customer portal and signing
            out. Avatar shows their initials. */}
        <div ref={accountMenuRef} className="relative">
          <button
            onClick={() => setOpenMenu((m) => (m === "account" ? null : "account"))}
            aria-label="Account menu"
            aria-expanded={openMenu === "account"}
            aria-haspopup="menu"
            title="Account"
            className={`tap-target w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors font-display text-sm font-extrabold ${
              openMenu === "account"
                ? "bg-brand-purple text-white"
                : "bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/15"
            }`}
          >
            {initials || (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
              </svg>
            )}
          </button>

          {openMenu === "account" && (
            <div role="menu" className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[220px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
              <a
                href="/book"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenMenu(null)}
                className="flex items-center gap-2.5 w-full px-4 py-3 no-underline text-sm font-semibold text-brand-purple hover:bg-slate-50 transition-colors"
              >
                {PawIcon}
                Customer Portal
                <ExternalLink size={14} strokeWidth={2} className="ml-auto text-slate-400" aria-hidden="true" />
              </a>

              {isOnline && user && (
                <>
                  <div className="h-px bg-slate-200 mx-3" />
                  <button
                    onClick={() => { onSignOut(); setOpenMenu(null); }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-coral bg-transparent hover:bg-brand-coral-light transition-colors text-left font-[inherit]"
                  >
                    <LogOut size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                    Log out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile/tablet top bar (below lg) — logo, New booking, menu ──
          Light like the desktop bar; the nav strip directly below carries
          the hairline rule, so together they read as one quiet header.
          Both step aside on phones while the on-screen keyboard is up
          (see useKeyboardOpen) so the field being typed into keeps its
          room. */}
      <div className="lg:hidden max-md:keyboard:hidden -mx-[var(--app-gutter)] px-3 sm:px-5 pb-2 short:pb-1 pt-[calc(env(safe-area-inset-top)+0.5rem)] short:pt-[calc(env(safe-area-inset-top)+0.25rem)] flex items-center gap-2 bg-white text-slate-700">
        <NavLink to="/" className="shrink-0 no-underline" aria-label="Smarter Dog home">
          <BrandWordmark className="h-6 w-24" />
        </NavLink>
        <div className="flex-1" />
        {/* The one persistent booking entry point on mobile — every screen,
            same spot. New client lives in the menu sheet below. */}
        {onNewBooking && (
          <button
            type="button"
            onClick={onNewBooking}
            aria-label="New booking"
            className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full text-sm font-bold bg-brand-purple text-white cursor-pointer transition-colors hover:bg-brand-purple-light shrink-0 focus-visible:outline-2 focus-visible:outline-brand-purple focus-visible:outline-offset-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {/* On the very narrowest phones the label would push the bar past
                the viewport edge — the aria-label keeps the name for AT. */}
            <span className="max-[359px]:hidden">New booking</span>
          </button>
        )}
        <div ref={mobileMenuRef} className="relative shrink-0">
          <button
            onClick={() => setOpenMenu((m) => (m === "mobile" ? null : "mobile"))}
            aria-label="Menu"
            aria-expanded={openMenu === "mobile"}
            aria-haspopup="menu"
            className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
              openMenu === "mobile" ? "bg-slate-100 text-brand-purple" : "text-slate-500 hover:bg-slate-100 hover:text-brand-purple"
            }`}
          >
            <Menu size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
          {openMenu === "mobile" && (
            <div role="menu" className="absolute top-12 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-elevated min-w-[210px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
              {onNewClient && (
                <button
                  onClick={() => { onNewClient(); setOpenMenu(null); }}
                  className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-purple bg-transparent hover:bg-slate-50 transition-colors text-left font-[inherit]"
                >
                  <UserPlus size={16} strokeWidth={2.2} className="shrink-0 text-slate-500" aria-hidden="true" />
                  New client
                </button>
              )}
              {onOpenOverview && (
                <button
                  onClick={() => { onOpenOverview(); setOpenMenu(null); }}
                  className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-purple bg-transparent hover:bg-slate-50 transition-colors text-left font-[inherit]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="10" /><line x1="15" y1="4" x2="15" y2="10" />
                  </svg>
                  Week overview
                </button>
              )}
              <button
                onClick={() => { navigate("/needs-attention"); setOpenMenu(null); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-purple bg-transparent hover:bg-slate-50 transition-colors text-left font-[inherit]"
              >
                <ClipboardList size={16} strokeWidth={2.2} className="shrink-0 text-slate-500" aria-hidden="true" />
                Needs Attention
              </button>
              <button
                onClick={() => { navigate("/settings"); setOpenMenu(null); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-purple bg-transparent hover:bg-slate-50 transition-colors text-left font-[inherit]"
              >
                <SettingsIcon size={16} strokeWidth={2.2} className="shrink-0 text-slate-500" aria-hidden="true" />
                Settings
              </button>
              <div className="h-px bg-slate-200 mx-3" />
              <a
                href="/book"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenMenu(null)}
                className="flex items-center gap-2.5 w-full px-4 py-3 no-underline text-sm font-semibold text-brand-purple hover:bg-slate-50 transition-colors"
              >
                {PawIcon}
                Customer Portal
                <ExternalLink size={14} strokeWidth={2} className="ml-auto text-slate-400" aria-hidden="true" />
              </a>
              {isOnline && user && (
                <button
                  onClick={() => { onSignOut(); setOpenMenu(null); }}
                  className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-coral bg-transparent hover:bg-brand-coral-light transition-colors text-left font-[inherit]"
                >
                  <LogOut size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                  Log out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
