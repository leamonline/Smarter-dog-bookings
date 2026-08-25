import { Bell, Check, CheckCheck, CircleCheck, Send } from "lucide-react";
import { BOOKING_STATUS } from "../../../constants/salon";
import { titleCase } from "../../../utils/text";
import { IconMessage } from "../../icons/index.jsx";

/**
 * Card 3 of the booking detail surface: the "are you still coming?" reminder.
 *
 * Reminder status treatment — the card tint, status icon, status text and
 * reminder action — is driven by `booking.reminderState`
 * (none | sent | read | confirmed). That value is mirrored onto the root as
 * `data-state` and looked up in STATE_CONFIG. Collection-message priority is
 * separate and derives from the grooming status.
 *
 * Pick-up messaging is kept deliberately separate from the reminder status
 * (a distinct "Message …" action), so "we told them it's ready" never gets
 * conflated with "they confirmed they're coming".
 */

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Per-state presentation. `action` is the reminder action this state offers
// ("send" | "resend" | null) — read/confirmed are status-only by design.
// `status(ctx)` returns the human-readable line that screen readers get too.
const STATE_CONFIG = {
  none: {
    card: "bg-slate-50 border-slate-200",
    chip: "bg-slate-100 text-slate-500",
    eyebrow: "text-slate-500",
    statusTone: "text-slate-600",
    StatusIcon: Bell,
    action: "send",
    status: () => "No reminder sent yet",
  },
  sent: {
    card: "bg-amber-50 border-amber-200",
    chip: "bg-amber-100 text-amber-700",
    eyebrow: "text-amber-700/80",
    statusTone: "text-amber-900",
    StatusIcon: Check,
    action: null, // read-only once sent — reminder-send is idempotent (no resend)
    status: (ctx) =>
      `Reminder sent${ctx.sentWhen ? ` · ${ctx.sentWhen}` : ""}`,
  },
  read: {
    card: "bg-sky-50 border-sky-200",
    chip: "bg-sky-100 text-sky-700",
    eyebrow: "text-sky-700/80",
    statusTone: "text-sky-900",
    StatusIcon: CheckCheck,
    action: null,
    status: (ctx) =>
      `Read by ${ctx.client}${ctx.readWhen ? ` · ${ctx.readWhen}` : ""}`,
  },
  confirmed: {
    card: "bg-emerald-50 border-emerald-200",
    chip: "bg-emerald-100 text-emerald-700",
    eyebrow: "text-emerald-700/80",
    statusTone: "text-emerald-900",
    StatusIcon: CircleCheck,
    action: null,
    status: (ctx) => `Confirmed by ${ctx.client}`,
  },
};

export function ReminderCard({ booking, pickupHuman, isEditing, onSendReminder }) {
  // Single source of truth. Fall back to the one signal we persist today
  // (the confirmation timestamp) so the card is honest before the rest of
  // the lifecycle is wired up.
  const state =
    booking.reminderState ||
    (booking.reminderConfirmedAt ? "confirmed" : "none");
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.none;

  // reminderConfirmedBy is a source token ('customer' | 'staff'), not a name.
  // A staff confirmation says so plainly; a customer one names the person.
  const client =
    booking.reminderConfirmedBy === "staff"
      ? "staff"
      : titleCase(
          pickupHuman?.fullName ||
            booking.pickupBy ||
            booking.owner ||
            "the customer",
        );
  const statusText = cfg.status({
    client,
    sentWhen: formatWhen(booking.reminderSentAt),
    readWhen: formatWhen(booking.reminderReadAt),
  });

  const StatusIcon = cfg.StatusIcon;
  const pickupName = titleCase(
    pickupHuman?.fullName || booking.pickupBy || booking.owner,
  );
  const showPickupMessage = !isEditing && !!pickupHuman?.phone;
  const isReady = booking.status === BOOKING_STATUS.READY_FOR_PICKUP;

  const reminderAction = cfg.action === "send" && (
    <button
      type="button"
      onClick={onSendReminder}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3.5 py-2 max-sm:w-full rounded-full border-none bg-brand-purple text-white text-[13px] font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-purple-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1"
    >
      <Send size={13} aria-hidden="true" />
      Send reminder
    </button>
  );

  const pickupMessage = showPickupMessage && (
    <a
      href={`sms:${pickupHuman.phone}?body=${encodeURIComponent(
        `Hey, it's Smarter Dog Grooming Salon\n${titleCase(booking.dogName)} will be ready for collection in 15mins.\nSee you soon 🎓🐶❤️ X`,
      )}`}
      aria-label={`Send pickup-ready SMS to ${pickupName}`}
      data-priority={isReady ? "primary" : "secondary"}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 px-3.5 py-2 max-sm:w-full rounded-full text-[13px] font-bold no-underline cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
        isReady
          ? "border-none bg-brand-purple text-white hover:bg-brand-purple-light focus-visible:ring-brand-purple"
          : "border-[1.5px] border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300"
      }`}
    >
      <IconMessage size={14} colour="currentColor" />
      <span>Message {pickupName}</span>
    </a>
  );

  return (
    <section
      data-state={state}
      aria-label="Reminder"
      className={`mb-3 rounded-2xl border shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-3 ${cfg.card}`}
    >
      {/* Header — same anatomy as PanelShell: eyebrow left, icon chip right */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-black/5">
        <h3 className={`text-[10px] font-bold uppercase tracking-wider ${cfg.eyebrow}`}>
          Reminder
        </h3>
        <span
          aria-hidden="true"
          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${cfg.chip}`}
        >
          <Bell size={12} strokeWidth={2.4} />
        </span>
      </div>

      {/* Status line — readable by screen readers (role=status announces
          changes), not icon-only. The icon is decorative; the text carries
          the meaning. */}
      <div role="status" className={`flex items-center gap-2 ${cfg.statusTone}`}>
        <StatusIcon size={16} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
        <span className="text-[13px] font-bold leading-snug">{statusText}</span>
      </div>

      {/* Actions — reminder action (state-driven) kept distinct from the
          pick-up message action. */}
      {(cfg.action || showPickupMessage) && (
        <div className="flex flex-wrap gap-2 mt-3 max-sm:flex-col">
          {isReady && pickupMessage}
          {reminderAction}
          {!isReady && pickupMessage}
        </div>
      )}
    </section>
  );
}
