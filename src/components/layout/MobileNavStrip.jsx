import { NavLink } from "react-router-dom";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { usePendingSignupsCount } from "../../supabase/hooks/usePendingSignupsCount.js";
import { MOBILE_NAV } from "./navConfig.jsx";

// ── Mobile/tablet primary nav (below lg) ──────────────────────────
// A compact purple icon strip that sits directly under the context
// block, matching the header redesign. Replaces the old fixed bottom
// tab bar. Keeps the per-section active accent so staff recognise the
// current section by colour, and carries the same Inbox/Humans badges.
export function MobileNavStrip() {
  const { unread: waUnread } = useWhatsAppUnread();
  const waBadge = waUnread > 0 ? (waUnread > 99 ? "99+" : String(waUnread)) : null;
  const { count: pendingSignups } = usePendingSignupsCount();
  const humansBadge =
    pendingSignups > 0 ? (pendingSignups > 99 ? "99+" : String(pendingSignups)) : null;

  return (
    <nav
      className="lg:hidden -mx-4 sm:-mx-6 mb-3 px-2.5 sm:px-4 py-2 flex items-center gap-1.5 bg-brand-purple shadow-md"
      aria-label="Primary"
    >
      {MOBILE_NAV.map((item) => {
        const ariaLabel =
          item.to === "/inbox" && waUnread > 0
            ? `${item.label} — ${waUnread > 99 ? "99 plus" : waUnread} to reply`
            : item.to === "/humans" && pendingSignups > 0
              ? `${item.label} — ${pendingSignups > 99 ? "99 plus" : pendingSignups} new ${pendingSignups === 1 ? "customer" : "customers"} awaiting approval`
              : item.label;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            aria-label={ariaLabel}
            title={item.label}
            className={({ isActive }) =>
              `relative flex-1 inline-flex items-center justify-center h-11 rounded-xl no-underline transition-all duration-150 ${
                isActive
                  ? `${item.activeBg} font-bold`
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <span className="shrink-0" aria-hidden="true">
              {item.icon}
            </span>
            {item.to === "/inbox" && waBadge && (
              <span
                className="absolute top-1 right-[calc(50%-18px)] min-w-[16px] h-[16px] px-1 rounded-full bg-brand-coral text-white text-[9px] font-bold flex items-center justify-center leading-none"
                aria-hidden="true"
              >
                {waBadge}
              </span>
            )}
            {item.to === "/humans" && humansBadge && (
              <span
                className="absolute top-1 right-[calc(50%-18px)] min-w-[16px] h-[16px] px-1 rounded-full bg-brand-yellow text-brand-purple text-[9px] font-bold flex items-center justify-center leading-none"
                aria-hidden="true"
              >
                {humansBadge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
