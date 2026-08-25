// Shared presentational building blocks for the Daily Brief.
// All status/urgency is carried by text + hierarchy + an accent rail — never
// colour alone — matching the app's accessibility bar. Every tap target is at
// least 44px tall (wet hands, one thumb, a wriggling dog under the other arm).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Car, ChevronDown } from "lucide-react";

/** Whole-pound money for operational nudges (no decimals of pence). */
export function formatMoney(amount) {
  if (amount == null) return "";
  return `£${Math.round(amount)}`;
}

/** "11:05" on the salon (Europe/London) clock; null for missing/invalid ISO. */
export function formatLondonTime(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

// ---- Honest wait-time colour --------------------------------------------------
// A collection wait takes its colour from these thresholds alone — never from
// the section the card sits in, and never green. Tune them here.
export const WAIT_AMBER_MINUTES = 60;
export const WAIT_RED_MINUTES = 120;

/** Threshold tone for a wait: neutral < 60 min ≤ amber < 120 min ≤ red. */
export function waitTone(mins) {
  if (mins == null) return "neutral";
  if (mins >= WAIT_RED_MINUTES) return "red";
  if (mins >= WAIT_AMBER_MINUTES) return "amber";
  return "neutral";
}

// Text tokens ≥ 4.5:1 (WCAG AA) on white and on the pale amber tint.
export const WAIT_TONE_CLASS = {
  neutral: "text-slate-700",
  amber: "text-amber-800",
  red: "text-brand-coral-text",
};

/**
 * A one-line reassurance row for a category with nothing in it — replaces a
 * whole empty card so a good day reads calm, not padded.
 */
export function CompactZeroState({ children }) {
  return (
    <p className="flex items-center gap-2.5 rounded-xl border border-brand-teal/20 bg-brand-teal/[0.05] px-4 py-2.5 text-[13px] font-semibold text-brand-teal-text">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {children}
    </p>
  );
}

// ---- Operational-priority rail ------------------------------------------------
// The engine (entryOpStatus in engine/today.ts) decides WHICH tone a booking
// gets; this map decides what each tone LOOKS like. The rail is the card's
// only state colour — card surfaces stay white so green can never grow a
// second meaning again.

/** Left accent rail fill per operational tone. */
export const RAIL_TONE_CLASS = {
  coral: "bg-brand-coral",
  amber: "bg-amber-400",
  emerald: "bg-emerald-500",
  cyan: "bg-brand-cyan",
  teal: "bg-brand-teal",
  neutral: "bg-slate-200",
  muted: "bg-slate-300",
};

/**
 * The one status-chip pattern for this page: pale tint + AA text + a leading
 * dot or glyph, so no status ever leans on colour alone. Colours come in via
 * className (token utilities) or style (the status palette tokens).
 */
export function Chip({ className = "", style, dot = false, icon = null, title, ariaLabel, children }) {
  return (
    <span
      data-today-status-pill
      aria-label={ariaLabel}
      className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-bold ${className}`}
      style={style}
      title={title}
    >
      {dot && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {icon && <span aria-hidden className="inline-flex shrink-0 items-center">{icon}</span>}
      {children}
    </span>
  );
}

/** Read-only WhatsApp "on my way" signal for a dog waiting to be collected. */
export function OnTheWayChip({ signal }) {
  if (!signal) return null;
  return (
    <Chip
      icon={<Car size={12} strokeWidth={2.5} aria-hidden="true" />}
      className="bg-brand-teal/15 text-brand-teal-text whitespace-nowrap"
      title={`“${signal.text}”`}
    >
      On the way{signal.minutesAgo > 1 ? ` · ${signal.minutesAgo} min ago` : ""}
    </Chip>
  );
}

/**
 * Welfare / handover chips — surfaced plainly, never editorialised, and never
 * hidden behind a tap. One chip per fact, in the same coral safety language as
 * the shared SafetyAlertChip on the Dogs and Humans directories, so a welfare
 * fact carries the same weight wherever staff meet it.
 */
export function WelfareChips({ alerts = [], pregnant = false, notes = "" }) {
  const chips = [];
  if (pregnant) chips.push("Pregnant");
  for (const a of alerts) chips.push(a);
  if (notes && notes.trim()) chips.push(notes.trim());
  if (chips.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex max-w-full items-start gap-1 rounded-md border border-brand-coral/20 bg-brand-coral-light px-1.5 py-0.5 text-micro font-semibold text-brand-coral-text"
        >
          <AlertTriangle size={12} aria-hidden="true" className="mt-px shrink-0" />
          <span className="break-words">{c}</span>
        </span>
      ))}
    </div>
  );
}

/** The one strong action on a card — teal, filled, unmissable. */
export function PrimaryButton({ onClick, children, disabled, fluid = false, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-brand-teal text-white text-[13px] font-bold hover:bg-brand-teal-dark motion-safe:transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${fluid ? "w-full" : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The quieter companion action — filled but subtle, never competing. */
export function SecondaryButton({ onClick, children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-h-[44px] px-3.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 motion-safe:transition-colors"
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The card-level "More" menu — one quiet button that reveals the lower-priority
 * actions, so a card never shows five equal-weight buttons. The panel renders
 * through a portal so an ancestor's overflow can never clip it, and it keeps
 * the full menu keyboard contract its `role="menu"` promises: focus moves to
 * the first item on open, arrows/Home/End traverse, Escape closes and returns
 * focus to the trigger, and scrolling dismisses (menus don't float free).
 * `items` = [{ label, onClick, disabled }]; renders nothing when empty.
 */
export function MoreMenu({ items, label = "More", menuLabel }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      bottom: null,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  // Second pass: if the panel would run past the bottom of the viewport,
  // flip it above the trigger — it must always be fully on screen.
  useLayoutEffect(() => {
    if (!open || !position || position.bottom != null || !menuRef.current || !triggerRef.current) return;
    const panel = menuRef.current.getBoundingClientRect();
    if (panel.bottom > window.innerHeight - 8) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition((previous) => ({
        ...previous,
        top: null,
        bottom: Math.max(8, window.innerHeight - rect.top + 4),
      }));
    }
  }, [open, position]);

  useEffect(() => {
    // The panel mounts a tick after open (its position is measured first), so
    // wait for both before wiring focus + dismissal.
    if (!open || !position) return;
    // Focus the first enabled item so arrow keys work immediately.
    const first = menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)');
    // preventScroll: the fixed panel is already in view, and a focus-scroll
    // would immediately trip the scroll-dismiss listener below.
    first?.focus({ preventScroll: true });

    const onDocClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onScroll = () => close();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey, true);
    // Scroll dismisses (menus don't float free of their trigger) — but only
    // after a beat, so the scroll-into-view that often precedes the opening
    // tap can finish without instantly closing what it just opened.
    const scrollArmTimer = setTimeout(() => {
      window.addEventListener("scroll", onScroll, true);
    }, 150);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey, true);
      clearTimeout(scrollArmTimer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position]);

  const visible = (items || []).filter(Boolean);
  if (visible.length === 0) return null;

  const moveFocus = (delta, edge = null) => {
    const nodes = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    if (nodes.length === 0) return;
    if (edge === "start") return nodes[0].focus();
    if (edge === "end") return nodes[nodes.length - 1].focus();
    const index = nodes.indexOf(document.activeElement);
    const next = index === -1 ? 0 : (index + delta + nodes.length) % nodes.length;
    nodes[next].focus();
  };

  const onMenuKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-1); }
    else if (e.key === "Home") { e.preventDefault(); moveFocus(0, "start"); }
    else if (e.key === "End") { e.preventDefault(); moveFocus(0, "end"); }
    else if (e.key === "Tab") close();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        // No mousedown focus: near the viewport edge the browser's
        // focus-scroll would move the button between press and release and
        // swallow the click entirely. Keyboard focus is unaffected, and item
        // selection restores focus to this trigger explicitly.
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-brand-purple outline-none transition-colors hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
      >
        {label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-slate-500 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && position
        ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={menuLabel}
            onKeyDown={onMenuKeyDown}
            style={position.bottom != null
              ? { bottom: position.bottom, right: position.right }
              : { top: position.top, right: position.right }}
            className="fixed z-[1200] min-w-[210px] max-w-[min(300px,calc(100vw-16px))] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-[0_8px_20px_rgba(45,0,75,0.12)] [max-height:calc(100dvh-16px)]"
          >
            {visible.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  close(true);
                  item.onClick?.();
                }}
                disabled={item.disabled}
                className="w-full cursor-pointer border-none bg-transparent px-3 py-2 text-left text-[13px] font-semibold text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple disabled:cursor-not-allowed disabled:text-slate-300"
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )
        : null}
    </>
  );
}

/** Tertiary text action — a link, but with a full-height tap area. */
export function TertiaryLink({ onClick, tone = "muted", children }) {
  const toneClass =
    tone === "purple"
      ? "text-brand-purple"
      : tone === "whatsapp"
        ? "text-brand-whatsapp-dark"
        : "text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center min-h-[44px] px-2 text-[13px] font-semibold ${toneClass} hover:underline underline-offset-2`}
    >
      {children}
    </button>
  );
}
