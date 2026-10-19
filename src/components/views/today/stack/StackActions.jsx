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
  primary: "border-[1.5px]",
  default: "border-[1.5px]",
  quiet: "border border-dashed px-3 text-[13.5px]",
};

// A two-column grid rather than free wrapping (#1001): free wrapping put five
// actions on three phone rows with "Didn't show" alone on the last. In the grid
// every row is a pair, and when the count is odd the first action takes the
// whole first row, so nothing is orphaned.
function spanFor(index, count) {
  return count % 2 === 1 && index === 0 ? " col-span-2" : "";
}

// The primary action is moved to the front so it is the one that gets the wide
// first row ("Reconfirmed" otherwise came before "Arrived"). Everything else
// keeps the order `tokenActions` gave it.
function primaryFirst(actions) {
  const primary = actions.filter((a) => a.kind === "primary");
  return primary.length ? [...primary, ...actions.filter((a) => a.kind !== "primary")] : actions;
}

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
  const ordered = primaryFirst(actions);

  return (
    <div data-stack-actions className="mt-3.5 grid grid-cols-2 gap-2">
      {ordered.map((action, index) =>
        action.href ? (
          <a
            key={action.id}
            href={action.href}
            aria-label={`${action.label} about ${dogName}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(action);
            }}
            className={`${BASE} text-center ${KIND_CLASS[action.kind]}${spanFor(index, actions.length)}`}
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
            className={`${BASE} text-center ${KIND_CLASS[action.kind]}${spanFor(index, actions.length)}`}
            style={styleFor(action.kind, tone)}
          >
            {action.label}
          </button>
        ),
      )}
    </div>
  );
}
