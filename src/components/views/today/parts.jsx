// Shared presentational building blocks for the salon board.
// Everything here is used by more than one surface: the board, its action
// panels, the gone-home strip and the Manage-availability modal. Card-era
// pieces (the accent rail, the per-card More menu, the welfare chip row, the
// wait-tone scale) were replaced by the token's tier ring, its safety mark and
// the one action panel — the board owns those decisions now, in
// engine/salonBoard.ts.
import { SERVICES } from "../../../constants/index";

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

// ---- Shared board text helpers -------------------------------------------------
// These were card-level helpers on the old status board. They are pure text
// and belong with the other shared primitives now that the board, the action
// panels and the gone-home strip all need them.

/** "1 dog" / "4 dogs" — used in every zone and group label. */
export function dogCountLabel(count) {
  return `${count} ${count === 1 ? "dog" : "dogs"}`;
}

/** A service id resolved to its human name, never a raw id. */
export function serviceLabel(service) {
  return SERVICES.find((item) => item.id === service)?.name || service || "Service not set";
}

/** "Rik Patel" → "Rik". Contact actions address a person, not a record. */
export function firstName(name) {
  return String(name || "the human").trim().split(/\s+/)[0] || "the human";
}

/** A dialable `tel:` href, or null when there is no usable number on file. */
export function telephoneHref(phone) {
  const compact = String(phone || "").replace(/[^\d+]/g, "");
  return compact ? `tel:${compact}` : null;
}

/**
 * Payment as a short phrase. Only reads as urgent (`actionReason`) once the
 * money actually blocks something — from Ready onward. A dog mid-groom that
 * will pay at pick-up is not yet a problem, so it must not look like one.
 */
export function PaymentState({ payment, actionReason = false }) {
  if (!payment) return null;
  if (payment.kind === "paid") {
    return (
      <span className="inline-flex items-center whitespace-nowrap text-[12px] font-bold text-emerald-700">
        Paid
      </span>
    );
  }
  if (payment.amountDue != null) {
    return (
      <span
        data-action-reason={actionReason ? "payment" : undefined}
        className={`inline-flex items-center whitespace-nowrap tabular-nums ${
          actionReason ? "text-[13px] font-bold text-brand-coral-text" : "text-[12px] font-semibold text-slate-500"
        }`}
      >
        {formatMoney(payment.amountDue)} due
      </span>
    );
  }
  return (
    <span
      data-action-reason={actionReason ? "payment" : undefined}
      className="inline-flex items-center whitespace-nowrap text-[12px] font-semibold text-slate-500"
    >
      {payment.label}
    </span>
  );
}

/**
 * Who confirmed this booking, and when — the fact the token deliberately does
 * not print. A customer's own WhatsApp confirmation and a staff-recorded one
 * carry the same operational weight, but the wording always says which.
 */
export function confirmationLabel(booking) {
  const time = formatLondonTime(booking?.reminderConfirmedAt);
  if (!time) return null;
  return booking.reminderConfirmedBy === "staff"
    ? `Confirmed by staff at ${time}`
    : `Customer confirmed at ${time}`;
}
