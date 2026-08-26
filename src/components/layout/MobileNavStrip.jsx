import { NavLink } from "react-router-dom";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { usePendingSignupsCount } from "../../supabase/hooks/usePendingSignupsCount.js";
import { MOBILE_NAV, navTargetFor } from "./navConfig.jsx";

// ── Mobile/tablet primary nav (below lg) ──────────────────────────
// A quiet strip of labelled tabs directly under the top bar. Every icon
// carries a visible text label — staff should never have to guess what a
// glyph means — and the active tab is a soft purple-tinted pill. The
// chrome stays light so the day's work below it holds the colour.
// Badges (Inbox unread, Humans approvals) ride on the icon.
export function MobileNavStrip({ currentDateStr, showBookingWorkspace = false }) {
  const { unread: waUnread } = useWhatsAppUnread();
  const waBadge = waUnread > 0 ? (waUnread > 99 ? "99+" : String(waUnread)) : null;
  const { count: pendingSignups } = usePendingSignupsCount();
  const humansBadge =
    pendingSignups > 0 ? (pendingSignups > 99 ? "99+" : String(pendingSignups)) : null;

  return (
    <nav
      className="lg:hidden -mx-4 sm:-mx-6 px-1.5 sm:px-3 py-1.5 flex items-stretch gap-1 bg-white border-b border-slate-200"
      aria-label="Primary"
    >
      {MOBILE_NAV.filter(
        (item) => !item.ownerFeature || showBookingWorkspace,
      ).map((item) => {
        const ariaLabel =
          item.to === "/inbox" && waUnread > 0
            ? `${item.label} — ${waUnread > 99 ? "99 plus" : waUnread} to reply`
            : item.to === "/humans" && pendingSignups > 0
              ? `${item.label} — ${pendingSignups > 99 ? "99 plus" : pendingSignups} new ${pendingSignups === 1 ? "customer" : "customers"} awaiting approval`
              : item.label;
        const badge =
          item.to === "/inbox" ? waBadge : item.to === "/humans" ? humansBadge : null;
        const badgeClass =
          item.to === "/inbox" ? "bg-brand-coral text-white" : "bg-brand-yellow text-brand-purple";
        return (
          <NavLink
            key={item.to}
            to={navTargetFor(item, currentDateStr)}
            end={item.to === "/"}
            aria-label={ariaLabel}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] px-0.5 rounded-xl no-underline motion-safe:transition-colors duration-150 ${
                isActive
                  ? "bg-brand-purple/[0.07] text-brand-purple font-bold"
                  : "text-slate-600 hover:bg-slate-100 hover:text-brand-purple font-semibold"
              }`
            }
          >
            <span className="relative shrink-0" aria-hidden="true">
              {item.icon}
              {badge && (
                <span
                  className={`absolute -top-1 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none ${badgeClass}`}
                >
                  {badge}
                </span>
              )}
            </span>
            <span className="text-[10px] leading-none tracking-tight" aria-hidden="true">
              {item.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
