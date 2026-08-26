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
// stated once per slot rather than repeated under every one — in a left-hand
// gutter beside its dogs where there is room for one, which costs the group no
// row of its own.
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
  highlightIds = null,
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
      className={`grid list-none items-start gap-x-1 gap-y-3 ${
        // Arriving drops back to the compact track at xl, where the gutter
        // takes its 80px — that is what keeps the gutter from costing a token
        // column. Everywhere else it matches the other zones.
        zone === "due"
          ? "grid-cols-[repeat(auto-fill,minmax(84px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(84px,1fr))]"
          : "grid-cols-[repeat(auto-fill,minmax(84px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))]"
      }`}
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
            showPaid={!!info.showPaid}
            onTheWay={!!info.onTheWay}
            density={density}
            selected={selectedId === id}
            dimmed={!!highlightIds && !highlightIds.has(id)}
            highlighted={!!highlightIds && highlightIds.has(id)}
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
      // A 2% tint gives the emptiness structure: the lane reads as a place
      // dogs stand, not leftover page. Deliberately faint — the tokens stay
      // the loudest thing on the board.
      className={`relative flex min-w-0 flex-col rounded-2xl bg-brand-purple/[0.025] p-2.5 transition-colors duration-150 ${className} ${
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
            <div
              key={group.key}
              data-slot-group={group.key}
              // The time sits in a left gutter BESIDE its dogs, so a slot costs
              // no row of its own — but only from xl, and the breakpoint is
              // measured rather than guessed. The gutter takes 80px off the
              // token grid, which is free at 1280 (the zone is ~458px and still
              // fits four tokens) and expensive below it: at 1024 and 768 the
              // zone is ~350px, the grid drops from three columns to two, and
              // the layout gets ~11% TALLER than the heading it replaced.
              // Below xl the heading goes back above its row.
              className="grid min-w-0 grid-cols-1 xl:grid-cols-[5rem_minmax(0,1fr)] xl:gap-x-2"
            >
              <div className="mb-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 px-1 xl:mb-0 xl:flex-col xl:items-start xl:gap-x-0 xl:pt-2">
                <h3 className="text-[13px] font-bold tabular-nums text-brand-purple">{group.label}</h3>
                {group.tokens.length > 1 ? (
                  <span className="text-[11px] font-semibold text-slate-500">
                    {dogCountLabel(group.tokens.length)}
                  </span>
                ) : null}
                {group.timing ? (
                  <span
                    data-slot-timing
                    // Balanced wrapping, not a wider gutter: 88px would fit
                    // "in 1 hr 45 min" on one line but costs a whole token
                    // column at 1280 (measured: 4 → 3, and the zone gets
                    // taller than the layout this replaced).
                    className={`text-[11px] font-bold leading-tight tabular-nums text-balance ${
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
