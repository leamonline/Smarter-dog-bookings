// The one action list, rendered by both the desktop popover and the mobile
// sheet. Same source (`tokenActions`), same order, same labels — a member of
// staff who learns the actions on an iPad already knows them on a phone.
//
// Tiers, not decoration: the primary action is the filled one, ordinary
// operations are outlined, and reference/reversal items are quiet text. That
// keeps "the next thing to do" obvious without a colour for every row.

const KIND_CLASS = {
  primary:
    "bg-brand-purple text-white hover:bg-brand-purple-light border border-transparent",
  default:
    "bg-white text-brand-purple border border-brand-purple/25 hover:bg-brand-purple/[0.05]",
  quiet:
    "bg-transparent text-slate-600 border border-transparent hover:bg-slate-100",
};

const BASE =
  "flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-[14px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * @param {object} props
 * @param {import("../../../../engine/salonBoard").TokenAction[]} props.actions
 * @param {(action: import("../../../../engine/salonBoard").TokenAction) => void} props.onSelect
 * @param {string} props.dogName  used only to disambiguate the accessible name
 * @param {boolean} [props.busy]  a write is in flight for this booking
 */
export function DogActionList({ actions, onSelect, dogName, busy = false, itemRole = "menuitem" }) {
  return actions.map((action) =>
    action.href ? (
      <a
        key={action.id}
        href={action.href}
        role={itemRole === "menuitem" ? "menuitem" : undefined}
        aria-label={`${action.label} about ${dogName}`}
        onClick={() => onSelect(action)}
        className={`${BASE} ${KIND_CLASS[action.kind]}`}
      >
        {action.label}
      </a>
    ) : (
      <button
        key={action.id}
        type="button"
        role={itemRole === "menuitem" ? "menuitem" : undefined}
        aria-label={`${action.label} — ${dogName}`}
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => onSelect(action)}
        className={`${BASE} ${KIND_CLASS[action.kind]}`}
      >
        {action.label}
      </button>
    ),
  );
}
