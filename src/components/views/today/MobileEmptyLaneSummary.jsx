// Below md, an individually-empty lane no longer renders its own large empty
// card — every currently-empty downstream lane folds into one compact row
// instead, e.g. "With us 0 · Ready 0 · Home 0". A populated lane always
// keeps its normal full rendering and is never also named here, at any
// width; desktop/tablet (md+) never renders this row at all.
export function MobileEmptyLaneSummary({ lanes }) {
  if (!lanes || lanes.length === 0) return null;

  const description = `${lanes.map((lane) => `${lane.title} 0 dogs`).join(", ")} — nothing waiting yet`;

  return (
    <p
      aria-label={description}
      className="md:hidden flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/65 px-3 py-2 text-[12px] font-semibold text-slate-500"
    >
      {lanes.map((lane, index) => (
        <span key={lane.key} aria-hidden="true" className="inline-flex items-center gap-1.5">
          {index > 0 ? <span className="text-slate-300">·</span> : null}
          {lane.title} 0
        </span>
      ))}
    </p>
  );
}
