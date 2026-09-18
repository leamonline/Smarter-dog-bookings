// The actions for one dog, in the card's own ink.
//
// Same source as the board's action panel — `tokenActions` — so the two
// surfaces cannot drift in what is legal, what it is called, or what order it
// comes in. Only the skin differs: the board's panel sits on white and uses
// brand purple, while a stack card is already tinted by status, so the buttons
// take their colour from the card.
//
// Tiers, not decoration. The primary action is the filled one, ordinary
// operations are outlined, reference and reversal items are quiet. That is what
// makes "the next thing to do" obvious without giving every row a colour.
const BASE =
  "flex min-h-11 items-center justify-center rounded-md px-4 text-[15px] font-medium " +
  "outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

// Every target is at least 44px tall, including the quiet tier. The prototype
// drops its quiet buttons to 40px; this does not, because the hands using this
// are wet and one of them is usually holding a dog.
const KIND_CLASS = {
  primary: "flex-auto border-[1.5px]",
  default: "flex-auto border-[1.5px]",
  quiet: "flex-none border border-dashed text-[13.5px]",
};

function styleFor(kind, tone) {
  if (kind === "primary") {
    return {
      backgroundColor: tone.ink,
      color: tone.tint,
      borderColor: tone.ink,
      outlineColor: tone.ink,
    };
  }
  if (kind === "quiet") {
    return {
      color: tone.meta,
      borderColor: "rgba(0,0,0,0.18)",
      outlineColor: tone.ink,
    };
  }
  return {
    backgroundColor: "rgba(0,0,0,0.05)",
    color: tone.ink,
    borderColor: "rgba(0,0,0,0.18)",
    outlineColor: tone.ink,
  };
}

/**
 * @param {object} props
 * @param {import("../../../../engine/salonBoard").TokenAction[]} props.actions
 * @param {(action: import("../../../../engine/salonBoard").TokenAction) => void} props.onSelect
 * @param {import("../../../ui/BookingStatusBadge").DayStatusTone} props.tone
 * @param {string} props.dogName  disambiguates the accessible name across cards
 * @param {boolean} [props.busy]  a write is in flight for this booking
 */
export function StackActions({ actions, onSelect, tone, dogName, busy = false }) {
  if (actions.length === 0) return null;

  return (
    <div data-stack-actions className="mt-3.5 flex flex-wrap gap-2">
      {actions.map((action) =>
        action.href ? (
          <a
            key={action.id}
            href={action.href}
            aria-label={`${action.label} about ${dogName}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(action);
            }}
            className={`${BASE} ${KIND_CLASS[action.kind]}`}
            style={styleFor(action.kind, tone)}
          >
            {action.label}
          </a>
        ) : (
          <button
            key={action.id}
            type="button"
            aria-label={`${action.label} — ${dogName}`}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(action);
            }}
            className={`${BASE} ${KIND_CLASS[action.kind]}`}
            style={styleFor(action.kind, tone)}
          >
            {action.label}
          </button>
        ),
      )}
    </div>
  );
}
