// The slot-grouped diary — the morning-brief layout. One white card, one
// bordered block per slot: bold time column, compact dog rows. A collapsed
// row is a disclosure button (name + meta only — chips and actions live
// OUTSIDE it, so no control nests inside another); expanding reveals the
// status line, welfare detail and the same contextual action set the old
// cards had. readOnly mode (the closed-day brief) renders no buttons and no
// time-relative chips at all.
import { useState } from "react";
import { entryOpStatus } from "../../../engine/today";
import { BOOKING_STATUS, DOG_SIZE } from "../../../constants/index";
import {
  Chip,
  CHIP_TONE_CLASS,
  WelfareChips,
  BookingStatusLine,
  OnTheWayChip,
  PrimaryButton,
  SecondaryButton,
  ActionTile,
  PaymentMethodChooser,
  MoreMenu,
  Chevron,
  formatMinutes,
} from "./parts.jsx";

function lastContact(b) {
  if (!b.reminderSentAt) return "not contacted yet";
  const t = new Date(b.reminderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `reminder sent ${t}`;
}

const MAX_COLLAPSED_CHIPS = 2;

/**
 * Priority-ordered chip list for a collapsed row. Time-relative chips
 * (late/payment/unconfirmed) are engine-decided and NEVER produced in
 * readOnly (future-day) mode — buildFutureDayFeed zeroes the flags, and this
 * guard makes the rule local too.
 */
function collapsedChips({ entry, welfare, isLargeDog, sharedOwner, readOnly }) {
  const chips = [];
  if (!readOnly) {
    const op = entryOpStatus(entry);
    if (op.kind === "overdue") chips.push({ key: "op", label: `${formatMinutes(entry.overdueMinutes)} overdue`, cls: CHIP_TONE_CLASS.coral });
    else if (["paymentDue", "unconfirmed", "readyWaiting"].includes(op.kind)) chips.push({ key: "op", label: op.label, cls: CHIP_TONE_CLASS[op.tone] });
    if (entry.owes && op.kind !== "paymentDue" && entry.stage !== "booked") chips.push({ key: "owes", label: "Payment due", cls: "bg-brand-yellow/25 text-slate-800" });
  }
  if (readOnly && (entry.booking.payment || "") === "Paid in Full") {
    chips.push({ key: "paid", label: "Paid", cls: CHIP_TONE_CLASS.neutral });
  }
  const alerts = (welfare.pregnant ? ["Pregnant"] : []).concat(welfare.alerts || []).filter(Boolean);
  if (alerts.length) chips.push({ key: "welfare", label: alerts.slice(0, 2).join(" · "), cls: "bg-amber-50 text-amber-800" });
  if (isLargeDog) chips.push({ key: "large", label: "Large dog", cls: "bg-cyan-50 text-cyan-800" });
  if (sharedOwner) chips.push({ key: "shared", label: "Two dogs, one owner", cls: CHIP_TONE_CLASS.neutral });
  return chips;
}

function ChipRow({ chips }) {
  if (chips.length === 0) return null;
  const shown = chips.slice(0, MAX_COLLAPSED_CHIPS);
  const hidden = chips.length - shown.length;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1 shrink-0 max-w-[45%] sm:max-w-none">
      {shown.map((c) => (
        <Chip key={c.key} dot className={c.cls}>{c.label}</Chip>
      ))}
      {hidden > 0 && <Chip className={CHIP_TONE_CLASS.muted}>{`+${hidden}`}</Chip>}
    </div>
  );
}

/**
 * The expanded detail + action block. Layout discipline: ONE full-width
 * primary, then a bar of equal-width icon tiles (More always last, and only
 * when it has items) — no control ever sizes to its own text or floats
 * right. Rare/risky actions (Didn't show, Hide until tomorrow) live behind
 * More so a wet-handed mis-tap can't fire them. The `mode` machine keeps the
 * two safeguards: collection has a confirm step, payment has the method
 * chooser.
 */
function RowDetail({ entry, welfare, pay, otw, handlers }) {
  const {
    onMarkArrived, onStartGroom, onMarkReady, onMarkCollected, onSendCollection,
    onMessageOwner, onMarkPaid, onDidntShow, onOpenBooking, onHideUntilTomorrow, resolve,
  } = handlers;
  const b = entry.booking;
  const d = resolve(b);
  const [mode, setMode] = useState("idle");

  const isReady = entry.stage === "ready";
  const isCollected = entry.stage === "collected";
  const collectionSent = !!b.collectionSentAt;
  // Payment is only actionable once the dog has arrived — a not-yet-arrived
  // dog pays at pick-up, so we never nudge "Mark paid" on a still-Booked row.
  const owesNow = entry.owes && entry.stage !== "booked";
  // Money never hides; only a not-yet-arrived, not-owing booking can be tucked away.
  const canHide = entry.stage === "booked" && !entry.owes;

  const messageTile = { icon: "message", label: "Message", ariaLabel: "Message owner", onClick: () => onMessageOwner(b) };
  const bookingTile = { icon: "document", label: "Booking", ariaLabel: "Open booking", onClick: () => onOpenBooking(b.id) };
  const paidTile = { icon: "cash", label: "Paid", ariaLabel: "Mark paid", onClick: () => setMode("choosePayment") };

  let primary = null;
  const tiles = [];
  const moreItems = [];

  if (entry.isLate) {
    primary = <PrimaryButton fluid onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>;
    tiles.push(messageTile, bookingTile);
    moreItems.push({ label: "Didn't show", onClick: () => onDidntShow(b) });
  } else if (isReady) {
    if (collectionSent) {
      primary = <PrimaryButton fluid onClick={() => setMode("confirmCollect")}>Mark collected</PrimaryButton>;
      tiles.push({ icon: "refresh", label: "Resend", ariaLabel: "Resend message", onClick: () => onSendCollection(b) });
    } else {
      primary = <PrimaryButton fluid onClick={() => onSendCollection(b)}>Send collection message</PrimaryButton>;
      tiles.push({ icon: "check", label: "Collected", ariaLabel: "Mark collected", onClick: () => setMode("confirmCollect") });
    }
    if (owesNow) tiles.push(paidTile);
    tiles.push(messageTile);
    moreItems.push({ label: "Open booking", onClick: () => onOpenBooking(b.id) });
  } else if (entry.stage === "inSalon") {
    // Checked in → the groom is the next step; In bath → it's finishing.
    if (b.status === BOOKING_STATUS.CHECKED_IN) {
      primary = <PrimaryButton fluid onClick={() => onStartGroom(b)}>Start groom</PrimaryButton>;
      tiles.push({ icon: "bell", label: "Ready", ariaLabel: "Mark ready", onClick: () => onMarkReady(b) });
    } else {
      primary = <PrimaryButton fluid onClick={() => onMarkReady(b)}>Mark ready</PrimaryButton>;
    }
    if (owesNow) tiles.push(paidTile);
    tiles.push(messageTile, bookingTile);
  } else if (isCollected) {
    if (owesNow) {
      // Money at risk — recording the payment IS the primary action.
      primary = <PrimaryButton fluid onClick={() => setMode("choosePayment")}>Mark paid</PrimaryButton>;
      tiles.push(messageTile, bookingTile);
    } else {
      tiles.push(bookingTile, messageTile);
    }
  } else if (entry.isUnconfirmed) {
    // A reminder was sent and went unanswered — the job is to chase it, which
    // happens in the owner's message thread.
    primary = <PrimaryButton fluid onClick={() => onMessageOwner(b)}>Chase confirmation</PrimaryButton>;
    tiles.push({ icon: "login", label: "Arrived", ariaLabel: "Mark arrived", onClick: () => onMarkArrived(b) }, bookingTile);
  } else {
    // Plain booked / next.
    primary = <PrimaryButton fluid onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>;
    tiles.push(messageTile, bookingTile);
  }
  if (canHide) moreItems.push({ label: "Hide until tomorrow", onClick: () => onHideUntilTomorrow(b.id) });

  let actionArea;
  if (mode === "confirmCollect") {
    actionArea = (
      <div className="grid grid-cols-2 gap-1.5">
        <PrimaryButton fluid onClick={() => { onMarkCollected(b); setMode("idle"); }}>Confirm collected</PrimaryButton>
        <SecondaryButton onClick={() => setMode("idle")}>Cancel</SecondaryButton>
      </div>
    );
  } else if (mode === "choosePayment") {
    actionArea = (
      <PaymentMethodChooser
        onPick={(m) => { onMarkPaid(b, m); setMode("idle"); }}
        onCancel={() => setMode("idle")}
      />
    );
  } else {
    actionArea = (
      <>
        {primary}
        {(tiles.length > 0 || moreItems.length > 0) && (
          <div className="grid grid-flow-col auto-cols-fr gap-1.5">
            {tiles.map((t) => (
              <ActionTile key={t.label} {...t} />
            ))}
            {moreItems.length > 0 && <MoreMenu tile items={moreItems} menuLabel={`More actions for ${d.dogName}`} />}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="pt-1.5">
      <BookingStatusLine booking={b} waitMinutes={entry.waitMinutes} pay={pay}>
        {entry.isLate && <span className="font-semibold text-brand-coral-text">{formatMinutes(entry.overdueMinutes)} overdue</span>}
        {entry.isUnconfirmed && <span>· {lastContact(b)}</span>}
        {isReady && b.pickupBy && <span>Pick-up: {b.pickupBy}</span>}
        {otw && <OnTheWayChip signal={otw} />}
        {b.notes && b.notes.trim() && <span className="italic">“{b.notes.trim()}”</span>}
      </BookingStatusLine>
      <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
      <div className="flex flex-col gap-1.5 mt-2.5">{actionArea}</div>
    </div>
  );
}

function DiaryRow({ entry, readOnly, expanded, onToggleExpand, highlighted, ownerCounts, dogs, handlers }) {
  const b = entry.booking;
  const d = handlers.resolve(b);
  const welfare = handlers.getWelfare(b);
  const pay = handlers.paymentOf(b);
  const isReadyStage = entry.stage === "ready";
  const otw = !readOnly && isReadyStage && b.whatsappConversationId ? handlers.onTheWaySignals?.[b.whatsappConversationId] : null;
  const muted = !readOnly && entry.stage === "collected" && !entry.owes;

  const dog = b._dogId ? dogs?.[b._dogId] : null;
  const ownerId = dog?._humanId ?? null;
  const sharedOwner = !!ownerId && (ownerCounts?.[ownerId] ?? 0) > 1;
  const isLargeDog = (b.size || dog?.size || "").toLowerCase() === DOG_SIZE.LARGE.toLowerCase();
  const sizeLetter = (b.size || dog?.size || "").charAt(0).toUpperCase() || null;

  const chips = collapsedChips({ entry, welfare, isLargeDog, sharedOwner, readOnly });

  const summary = (
    <>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`font-bold text-[14px] truncate ${muted ? "text-slate-500" : "text-brand-purple"}`}>
          {muted && <span aria-hidden>✓ </span>}
          {d.dogName}
        </span>
        {sizeLetter && (
          <span className="shrink-0 text-[10px] font-bold text-brand-purple-light border border-brand-paper-line rounded px-1">{sizeLetter}</span>
        )}
      </span>
      <span className="block text-[12.5px] text-slate-600 truncate">
        {[d.breed, b.service, d.owner].filter(Boolean).join(" · ")}
      </span>
    </>
  );

  return (
    <div
      id={`today-card-${b.id}`}
      className={`scroll-mt-32 rounded-lg ${highlighted ? "ring-2 ring-brand-teal/50" : ""} ${entry.isNext ? "bg-brand-teal/[0.04]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        {readOnly ? (
          <div className="min-w-0 flex-1 py-1">{summary}</div>
        ) : (
          <button
            type="button"
            id={`today-card-${b.id}-toggle`}
            aria-expanded={expanded}
            aria-controls={`today-card-${b.id}-detail`}
            onClick={() => onToggleExpand(b.id)}
            className="min-w-0 flex-1 flex items-start justify-between gap-2 text-left min-h-[44px] py-1 rounded-lg hover:bg-slate-50 motion-safe:transition-colors"
          >
            <span className="min-w-0">{summary}</span>
            <Chevron open={expanded} />
          </button>
        )}
        <ChipRow chips={chips} />
      </div>
      {!readOnly && (
        <div id={`today-card-${b.id}-detail`} hidden={!expanded}>
          {expanded && <RowDetail entry={entry} welfare={welfare} pay={pay} otw={otw} handlers={handlers} />}
        </div>
      )}
    </div>
  );
}

export function BookingFeed({
  groups,
  readOnly = false,
  ownerCounts = {},
  dogs = null,
  expandedIds = new Set(),
  onToggleExpand = () => {},
  highlightId = null,
  ...handlers
}) {
  return (
    <section
      className="rounded-2xl border border-brand-paper-line bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden"
      aria-label="Diary"
    >
      <div className="px-3 sm:px-4">
        {groups.map((g) => (
          <div key={g.label} className="flex gap-3.5 py-2.5 border-t border-slate-100 first:border-t-0">
            <div className={`shrink-0 w-[52px] pt-1 text-[13px] font-bold tabular-nums ${g.slot ? "text-brand-purple" : "text-slate-500"}`}>
              {g.label}
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
              {g.entries.map((entry) => (
                <DiaryRow
                  key={entry.booking.id}
                  entry={entry}
                  readOnly={readOnly}
                  expanded={expandedIds.has(entry.booking.id)}
                  onToggleExpand={onToggleExpand}
                  highlighted={highlightId === entry.booking.id}
                  ownerCounts={ownerCounts}
                  dogs={dogs}
                  handlers={handlers}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
