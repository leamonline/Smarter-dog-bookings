// Shared presentational building blocks for the Today command centre.
// All status/urgency is carried by text + hierarchy + an accent bar — never
// colour alone — matching the app's accessibility bar. Every tap target is at
// least 44px tall (wet hands, one thumb, a wriggling dog under the other arm).
import { useEffect, useRef, useState } from "react";
import { BOOKING_STATUS, getStatusDisplay } from "../../../constants/index";
import { PAYMENT_METHODS } from "../../../constants/salon";

/** "25 min", "1 hr 5 min", "just now". */
export function formatMinutes(mins) {
  if (mins == null) return null;
  if (mins <= 0) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

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
const WAIT_TONE_CLASS = {
  neutral: "text-slate-700",
  amber: "text-amber-800",
  red: "text-brand-coral-text",
};

/** Threshold-toned wait duration — "waiting 25 min", or the bare duration. */
export function WaitBadge({ minutes, withWord = true }) {
  if (minutes == null) return null;
  const duration = formatMinutes(minutes);
  return (
    <span className={`font-bold tabular-nums ${WAIT_TONE_CLASS[waitTone(minutes)]}`}>
      {withWord ? `waiting ${duration}` : duration}
    </span>
  );
}

export function SectionCard({ title, subtitle, count, accent, action, children }) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <header className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-slate-100">
        {accent && <span aria-hidden className={`h-5 w-1.5 rounded-full ${accent}`} />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-slate-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-slate-600 mt-0.5">{subtitle}</p>}
        </div>
        {typeof count === "number" && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-slate-100 text-slate-700 text-[12px] font-bold">
            {count}
          </span>
        )}
        {action}
      </header>
      <div className="p-2 sm:p-3">{children}</div>
    </section>
  );
}

/** A calm, warm empty state — the warmth lives here. */
export function EmptyState({ children }) {
  return (
    <p className="px-3 py-6 text-center text-[13px] text-slate-600">{children}</p>
  );
}

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

// ---- Operational-priority tones -------------------------------------------------
// The engine (entryOpStatus in engine/today.ts) decides WHICH tone a booking
// gets; these maps decide what each tone LOOKS like. One rail + one chip class
// per tone, so the accent bar, the status chip and the Now strip always match.

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

/** Pale tint + AA text per operational tone (chip/label backgrounds). */
export const CHIP_TONE_CLASS = {
  coral: "bg-brand-coral/10 text-brand-coral-text",
  amber: "bg-amber-50 text-amber-800",
  emerald: "bg-emerald-50 text-emerald-700",
  cyan: "bg-cyan-50 text-cyan-800",
  teal: "bg-brand-teal/15 text-brand-teal-text",
  neutral: "bg-slate-100 text-slate-600",
  muted: "bg-slate-100 text-slate-500",
};

/** The single highest-priority status chip for a booking (engine-decided). */
export function OpStatusChip({ opStatus }) {
  if (!opStatus) return null;
  return (
    <Chip dot className={CHIP_TONE_CLASS[opStatus.tone] || CHIP_TONE_CLASS.neutral}>
      {opStatus.label}
    </Chip>
  );
}

/**
 * The one status-chip pattern for this page: pale tint + AA text + a leading
 * dot or glyph, so no status ever leans on colour alone. Colours come in via
 * className (token utilities) or style (the status palette tokens).
 */
export function Chip({ className = "", style, dot = false, icon = null, title, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${className}`}
      style={style}
      title={title}
    >
      {dot && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

export function StatusPill({ status }) {
  const d = getStatusDisplay(status);
  return (
    <Chip dot className="whitespace-nowrap" style={{ background: d.bg, color: d.color }}>
      {d.label}
    </Chip>
  );
}

/** Collection-message state — the same chip whichever card shows it. */
export function MessageStateChip({ sentAt }) {
  const time = formatLondonTime(sentAt);
  return time ? (
    <Chip icon="✓" className="bg-emerald-50 text-emerald-700 whitespace-nowrap">Message sent {time}</Chip>
  ) : (
    <Chip dot className="bg-amber-50 text-amber-800 whitespace-nowrap">Owner not messaged yet</Chip>
  );
}

/** Read-only WhatsApp "on my way" signal for a dog waiting to be collected. */
export function OnTheWayChip({ signal }) {
  if (!signal) return null;
  return (
    <Chip icon="🚗" className="bg-brand-teal/15 text-brand-teal-text whitespace-nowrap" title={`“${signal.text}”`}>
      On the way{signal.minutesAgo > 1 ? ` · ${signal.minutesAgo} min ago` : ""}
    </Chip>
  );
}

/** Welfare / handover chips — surfaced plainly, never editorialised. */
export function WelfareChips({ alerts = [], pregnant = false, notes = "" }) {
  const chips = [];
  if (pregnant) chips.push("Pregnant");
  for (const a of alerts) chips.push(a);
  if (notes && notes.trim()) chips.push(notes.trim());
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {chips.map((c, i) => (
        <Chip key={i} icon="⚑" className="bg-amber-50 text-amber-800">
          {c}
        </Chip>
      ))}
    </div>
  );
}

/** Payment fact for the status line — same wording on every card. */
function PaymentFact({ pay }) {
  if (!pay || pay.kind === "paid") return null;
  if (pay.kind === "deposit") {
    return (
      <span>
        Deposit {formatMoney(pay.depositPaid)} paid ·{" "}
        <span className="font-bold text-slate-800">{formatMoney(pay.amountDue)} balance</span>
      </span>
    );
  }
  if (pay.kind === "due") {
    return <span className="font-bold text-slate-800">{formatMoney(pay.amountDue)} due at pick-up</span>;
  }
  return <span>{pay.label}</span>;
}

/**
 * The canonical status line — every booking card on the Today page shows the
 * same facts in the same order: status + since-time, wait duration, message
 * state, payment due. Card-specific extras (pick-up time, "on the way",
 * notes) append via children. `showWaitWord={false}` drops the word
 * "waiting" where the card's headline already says "Waiting for collection".
 */
export function BookingStatusLine({ booking, waitMinutes = null, pay = null, showWaitWord = true, children }) {
  const isReady = booking.status === BOOKING_STATUS.READY_FOR_PICKUP;
  const inSalon = booking.status === BOOKING_STATUS.CHECKED_IN || booking.status === BOOKING_STATUS.IN_BATH;
  const since = formatLondonTime(isReady ? booking.readyAt : inSalon ? booking.checkedInAt : null);
  // "Booked" (incl. a missing/unknown status, which defaults to it) is the
  // page's default resting state — every card is Booked until something
  // happens, so the pill said nothing the position-in-the-list + rail
  // colour didn't already. Checked in / In bath / Ready / Completed keep
  // the pill: it's their only text label, and colour alone isn't enough.
  const isBooked = !booking.status || booking.status === BOOKING_STATUS.BOOKED;
  return (
    <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mt-1 text-[13px] text-slate-600">
      {!isBooked && <StatusPill status={booking.status} />}
      {since && <span>since {since}</span>}
      {isReady && <WaitBadge minutes={waitMinutes} withWord={showWaitWord} />}
      {isReady && <MessageStateChip sentAt={booking.collectionSentAt} />}
      <PaymentFact pay={pay} />
      {children}
    </div>
  );
}

/** The one strong action on a card — teal, filled, unmissable. */
export function PrimaryButton({ onClick, children, disabled, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-brand-teal text-white text-[13px] font-bold hover:bg-brand-teal-dark motion-safe:transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
 * actions, so a card never shows five equal-weight buttons. Keyboard + outside
 * click close it; items are proper menuitems. `items` = [{ label, onClick,
 * disabled }]; renders nothing when empty.
 */
export function MoreMenu({ items, label = "More", menuLabel }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const visible = (items || []).filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 motion-safe:transition-colors"
      >
        {label}
        <Chevron open={open} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[200px] bg-white rounded-lg border border-slate-200 shadow-[0_8px_20px_rgba(45,0,75,0.12)] py-1"
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
              disabled={item.disabled}
              className="w-full text-left px-3 py-2 text-[13px] font-semibold font-inherit text-slate-700 bg-transparent border-none cursor-pointer transition-colors hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
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

/**
 * "Mark paid" with the payment-method chooser — the one way a payment is
 * recorded from this page, wherever the dog's single card ends up, so the
 * method fact is never silently dropped from the takings.
 */
export function MarkPaidAction({ booking, onMarkPaid, variant = "primary" }) {
  const [choosing, setChoosing] = useState(false);
  if (choosing) {
    return (
      <>
        <span className="text-[13px] font-semibold text-slate-600 self-center">Paid by:</span>
        {PAYMENT_METHODS.map((m) => (
          <SecondaryButton key={m.id} onClick={() => { onMarkPaid(booking, m.id); setChoosing(false); }}>{m.label}</SecondaryButton>
        ))}
        <button type="button" onClick={() => setChoosing(false)} className="text-[13px] text-slate-500 underline min-h-[44px] px-1 bg-transparent border-none cursor-pointer">Cancel</button>
      </>
    );
  }
  const Trigger = variant === "primary" ? PrimaryButton : SecondaryButton;
  return <Trigger onClick={() => setChoosing(true)}>Mark paid</Trigger>;
}

/** Rotating chevron for expandable rows — a supporting cue, not the only one. */
export function Chevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-slate-500 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
