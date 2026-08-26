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
//
// Arriving is the exception: it is a schedule, so it groups by appointment
// time. The time belongs to the slot, not to each dog waiting in it, and is
// stated once above the dogs due then rather than repeated under every one.
import { BOARD_ZONE_META, groupTokensBySlot } from "../../../../engine/salonBoard";
import { DogToken } from "./DogToken.jsx";

function dogCountLabel(count) {
  return `${count} ${count === 1 ? "dog" : "dogs"}`;
}

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
  const countLabel = dogCountLabel(tokens.length);

  const renderTokens = (list, testId) => (
    <ul
      data-testid={`${testId}-zone-tokens`}
      className="grid list-none grid-cols-[repeat(auto-fill,minmax(84px,1fr))] items-start gap-x-1 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))]"
    >
      {list.map((token) => {
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
  );

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
      ) : zone === "due" ? (
        <div data-testid="due-zone-groups" className="flex flex-col gap-2.5">
          {groupTokensBySlot(tokens).map((group) => (
            <div key={group.key} data-slot-group={group.key} className="min-w-0">
              <div className="mb-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 px-1">
                <h3 className="text-[13px] font-bold tabular-nums text-brand-purple">{group.label}</h3>
                {group.tokens.length > 1 ? (
                  <span className="text-[11px] font-semibold text-slate-500">
                    {dogCountLabel(group.tokens.length)}
                  </span>
                ) : null}
                {group.timing ? (
                  <span
                    data-slot-timing
                    className={`text-[11px] font-bold tabular-nums ${
                      group.tokens[0].tier === "urgent" ? "text-brand-coral-text" : "text-slate-500"
                    }`}
                  >
                    {group.timing}
                  </span>
                ) : null}
              </div>
              {renderTokens(group.tokens, `${zone}-${group.key}`)}
            </div>
          ))}
        </div>
      ) : (
        renderTokens(tokens, zone)
      )}
    </section>
  );
}
