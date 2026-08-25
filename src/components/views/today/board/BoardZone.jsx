// One zone of the board — a place in the room, not a column of cards.
//
// Zones are ALWAYS rendered, even when empty. That is the whole point of a
// spatial interface: "Ready" is in the same place at 07:00 as it is at 13:00,
// so staff learn where to look instead of reading three headings each time. An
// empty zone costs one calm line, which is cheaper than losing the map.
//
// The tokens inside wrap into an auto-filling grid, so a zone holding one dog
// is one row tall and a zone holding twenty is five — the board grows with the
// day rather than reserving a stadium for it.
import { BOARD_ZONE_META } from "../../../../engine/salonBoard";
import { DogToken } from "./DogToken.jsx";

function exceptionFor(zone, tokens) {
  const urgent = tokens.filter((token) => token.tier === "urgent").length;
  if (urgent === 0) return null;
  if (zone === "due") return urgent === 1 ? "1 late" : `${urgent} late`;
  if (zone === "ready") return urgent === 1 ? "1 waiting a while" : `${urgent} waiting a while`;
  return urgent === 1 ? "1 needs you" : `${urgent} need you`;
}

export function BoardZone({
  zone,
  tokens,
  density = "regular",
  className = "",
  dropActive = false,
  dropEligible = false,
  selectedId = null,
  attentionActive = false,
  busyIds,
  draggingId = null,
  landedId = null,
  dragEnabled = false,
  onActivateToken,
  onTokenPointerDown,
  registerTokenRef,
  tokenMeta,
}) {
  const meta = BOARD_ZONE_META[zone];
  const exception = exceptionFor(zone, tokens);
  const countLabel = `${tokens.length} ${tokens.length === 1 ? "dog" : "dogs"}`;

  return (
    <section
      data-drop-zone={zone}
      data-drop-active={dropActive ? "true" : "false"}
      data-zone-count={tokens.length}
      aria-label={`${meta.title}, ${countLabel}`}
      className={`relative flex min-w-0 flex-col rounded-2xl p-2 transition-colors duration-150 ${className} ${
        dropActive
          ? "bg-brand-purple/[0.07] outline-2 outline-dashed outline-offset-[-2px] outline-brand-purple/40"
          : dropEligible
            ? "bg-brand-purple/[0.02] outline-2 outline-dashed outline-offset-[-2px] outline-brand-purple/15"
            : "outline-2 outline-transparent"
      }`}
    >
      <header className="mb-2 flex min-w-0 items-baseline gap-2 px-1">
        <h2 className="text-label text-slate-500">{meta.title}</h2>
        <span className="text-[12px] font-bold tabular-nums text-brand-purple">{tokens.length}</span>
        {exception ? (
          <span className="truncate text-[11px] font-bold text-brand-coral-text">{exception}</span>
        ) : null}
        <p className="sr-only">{meta.purpose}</p>
      </header>

      {tokens.length === 0 ? (
        <p
          data-zone-empty="true"
          className="px-1 pb-2 text-[12px] font-medium text-slate-400"
        >
          {meta.empty}
        </p>
      ) : (
        <ul
          data-testid={`${zone}-zone-tokens`}
          className="grid list-none grid-cols-[repeat(auto-fill,minmax(84px,1fr))] items-start gap-x-1 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))]"
        >
          {tokens.map((token) => {
            const id = String(token.booking.id);
            const info = tokenMeta(token);
            return (
              <DogToken
                key={id}
                token={token}
                dogName={info.dogName}
                ownerName={info.ownerName}
                welfare={info.welfare}
                amountDue={info.amountDue}
                showBalance={info.showBalance}
                onTheWay={!!info.onTheWay}
                density={density}
                selected={selectedId === id}
                dimmed={attentionActive && !token.needsAttention}
                highlighted={attentionActive && token.needsAttention}
                busy={busyIds?.has(id)}
                dragging={draggingId === id}
                landed={landedId === id}
                draggable={dragEnabled}
                onActivate={onActivateToken}
                onPointerDown={(event) => onTokenPointerDown?.(event, token)}
                registerRef={registerTokenRef}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
