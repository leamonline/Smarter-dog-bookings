// Every currently-empty lane folds into one calm reassurance line instead of
// renting a full column to say "no dogs" — at every width, not just phones.
// A populated lane always keeps its normal full rendering and is never also
// named here; the line disappears entirely once every lane has dogs.
import { CompactZeroState } from "./parts.jsx";

export function EmptyLaneSummary({ lanes }) {
  if (!lanes || lanes.length === 0) return null;

  const description = `${lanes.map((lane) => `${lane.title} — nobody yet`).join(", ")}`;

  return (
    <CompactZeroState>
      <span aria-label={description} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {lanes.map((lane, index) => (
          <span key={lane.key} aria-hidden="true" className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {index > 0 ? <span className="text-brand-teal/40">·</span> : null}
            {lane.title} — nobody yet
          </span>
        ))}
      </span>
    </CompactZeroState>
  );
}
