// A quiet nudge for dogs in this week's diary whose RECORD has no size.
//
// WHY THIS EXISTS
//
// A dog with no size on its record cannot be booked online at all — the portal
// wizard greys it out and the WhatsApp Flow leaves it with no services to pick
// (#682) — and staff must supply the size by hand every time they book it
// (#683). 139 such dogs exist as a one-off artefact of the April 2026 import.
//
// They cannot be repaired automatically: every booking those dogs have reads
// "small", which was a UI default echoing back rather than anything anyone
// observed. So the fix needs a person who knows the dog, and the best moment is
// when the dog is actually coming in — which is exactly what this lists.
//
// Deliberately understated: this is background tidying, not an incident. It
// uses the neutral paper surface rather than the coral alert treatment that
// UnknownStatusRecovery uses for a booking that cannot be placed in a lane.
import { titleCase } from "../../../utils/text";

/** "2026-08-26" → "Wed 26 Aug" (salon-local, no TZ rollover). */
function shortDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  }).format(d);
}

export function MissingSizeNotice({ dogs, onOpenDog }) {
  if (!dogs || dogs.length === 0) return null;

  return (
    <section
      aria-label="Dogs booked this week with no size recorded"
      className="rounded-2xl border border-brand-paper-line bg-white px-3 py-3 sm:px-4"
    >
      <h2 className="text-[13px] font-extrabold text-brand-purple">
        {dogs.length === 1
          ? "1 dog booked this week has no size recorded"
          : `${dogs.length} dogs booked this week have no size recorded`}
      </h2>
      <p className="mt-0.5 text-[12px] font-medium text-ink-muted">
        They can’t book online until it’s set, and it has to be picked by hand
        every time. Easiest to add while the dog is with you.
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {dogs.map((dog) => (
          <li
            key={dog.dogId}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-brand-paper-line bg-brand-paper/60 px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-700">
              <strong className="text-brand-purple">{titleCase(dog.dogName)}</strong>
              <span aria-hidden="true"> · </span>
              {shortDate(dog.dateStr)}
              {dog.slot ? ` ${dog.slot}` : ""}
            </span>
            <button
              type="button"
              aria-label={`Set ${titleCase(dog.dogName)}'s size`}
              onClick={() => onOpenDog?.(dog.dogId)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-brand-purple/30 bg-white px-3 text-[12px] font-bold text-brand-purple outline-none hover:bg-brand-purple hover:text-white focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
            >
              Set size
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
