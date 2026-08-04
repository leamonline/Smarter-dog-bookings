# Today Action Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ragged mixed-width action buttons on expanded Today-view diary rows with one full-width primary + a bar of equal-width icon tiles, rare actions kept behind More.

**Architecture:** Presentation-only change in `src/components/views/today/`. New `ActionTile`/`TileIcon`/`PaymentMethodChooser` primitives plus a tile-shaped `MoreMenu` trigger in `parts.jsx`; `RowDetail` in `BookingFeed.jsx` is rewired to emit primary + tile list per state with an explicit `mode` state machine (`idle` / `confirmCollect` / `choosePayment`) preserving both safeguards. Engine (`entryOpStatus`), handlers, Now strip, and read-only mode untouched.

**Tech Stack:** React 19 JSX, Tailwind 4 utility classes, Vitest + Testing Library (jsdom "component" project).

**Spec:** `docs/superpowers/specs/2026-07-14-today-action-tiles-design.md`

## Global Constraints

- Branch: `feat/today-action-tiles` (already created; `main` auto-deploys to production — never commit there).
- CI bar before push: `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build` all pass.
- Known local-only failures: ~6 directory tests (localStorage isolation) may fail locally; CI is the source of truth. The today/parts test files must pass locally.
- Tap targets ≥ 44px tall (tiles use `min-h-[48px]`).
- Every tile shows a visible text label; icons never replace words. Visible label must be a substring of the `aria-label` (WCAG 2.5.3 Label in Name), e.g. visible "Collected" / aria `"Mark collected"`.
- No bare `console` in `src/`; UK English copy; sentence case labels.
- No new dependencies — icons are inline stroke SVGs matching the existing `Chevron`/`CompactZeroState` style.
- Component files stay `.jsx`; tests colocated as `*.component.test.jsx`.
- Rare/risky actions ("Didn't show", "Hide until tomorrow") must NEVER render as tiles — More menu only.
- The Paid tile renders only when `entry.owes && entry.stage !== "booked"` (the existing `owesNow` rule).
- Two-step safeguards preserved: Mark collected → confirm step; Mark paid → payment-method chooser (`cash` / `card` / `bank_transfer`).

---

### Task 1: Tile primitives in parts.jsx

**Files:**
- Modify: `src/components/views/today/parts.jsx`
- Test: `src/components/views/today/parts.component.test.jsx`

**Interfaces:**
- Produces: `ActionTile({ icon, label, ariaLabel, onClick, disabled })` — equal-width grid-cell button, icon above an 11px label, accessible name from `ariaLabel`.
- Produces: `TileIcon({ name })` — inline SVG; names: `message`, `cash`, `check`, `document`, `bell`, `login`, `refresh`, `dots`.
- Produces: `PaymentMethodChooser({ onPick, onCancel })` — renders "Paid by:" + one `SecondaryButton` per `PAYMENT_METHODS` entry + Cancel; `onPick(methodId)` gets `"cash" | "card" | "bank_transfer"`.
- Produces: `MoreMenu` gains a `tile` boolean prop — tile-shaped trigger (dots icon + "More" label), same popup/menuitem behaviour, same `menuLabel` aria-label.
- Produces: `PrimaryButton` gains a `fluid` boolean prop — appends `w-full`.
- `MarkPaidAction` is refactored to render `PaymentMethodChooser` internally; its external API (`booking`, `onMarkPaid`, `variant`) is unchanged (the Now strip keeps using it).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/views/today/parts.component.test.jsx` (add `ActionTile`, `PaymentMethodChooser` to the existing import from `./parts.jsx`):

```jsx
describe("ActionTile", () => {
  it("renders icon + short label with a full accessible name", () => {
    const onClick = vi.fn();
    render(<ActionTile icon="check" label="Collected" ariaLabel="Mark collected" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "Mark collected" });
    expect(btn).toHaveTextContent("Collected");
    expect(btn.querySelector("svg")).not.toBeNull();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});

describe("PaymentMethodChooser", () => {
  it("offers every payment method and a cancel", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    render(<PaymentMethodChooser onPick={onPick} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Bank transfer" }));
    expect(onPick).toHaveBeenCalledWith("bank_transfer");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("MoreMenu tile variant", () => {
  it("renders a tile-shaped trigger that still opens the menu", () => {
    const onA = vi.fn();
    render(<MoreMenu tile menuLabel="More actions for Rex" items={[{ label: "Didn't show", onClick: onA }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Rex" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Didn't show" }));
    expect(onA).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:component -- parts.component`
Expected: FAIL — `ActionTile` / `PaymentMethodChooser` are not exported.

- [ ] **Step 3: Implement the primitives**

In `src/components/views/today/parts.jsx`:

(a) Add after the `Chevron` export (bottom of file):

```jsx
// ---- Action tiles ---------------------------------------------------------
// The expanded-row action bar: equal-width cells, icon above a short label.
// The visible label is always a substring of the aria-label, so screen
// readers hear the full verb ("Mark collected") while the tile stays compact.
const TILE_ICON_PATHS = {
  message: <path d="M8 9h8m-8 4h6M6 18l-3 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6z" />,
  cash: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  document: <path d="M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />,
  bell: <path d="M10 5a2 2 0 1 1 4 0 7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1" />,
  login: <path d="M15 12H3m12 0-4 4m4-4-4-4M9 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" />,
  refresh: <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4m-4 4a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
};

export function TileIcon({ name }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {TILE_ICON_PATHS[name] || null}
    </svg>
  );
}

/** Shared tile chrome — also used by MoreMenu's tile trigger. */
export const TILE_CLASS =
  "w-full flex flex-col items-center justify-center gap-0.5 min-h-[48px] px-1 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-semibold leading-tight hover:bg-slate-200 motion-safe:transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function ActionTile({ icon, label, ariaLabel, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel || label} className={TILE_CLASS}>
      <TileIcon name={icon} />
      {label}
    </button>
  );
}

/**
 * The payment-method chooser — the one way a payment is recorded from this
 * page, so the method fact is never silently dropped from the takings.
 */
export function PaymentMethodChooser({ onPick, onCancel }) {
  return (
    <div className="flex items-center gap-2 flex-wrap w-full">
      <span className="text-[13px] font-semibold text-slate-600">Paid by:</span>
      {PAYMENT_METHODS.map((m) => (
        <SecondaryButton key={m.id} onClick={() => onPick(m.id)}>{m.label}</SecondaryButton>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="text-[13px] text-slate-500 underline min-h-[44px] px-1 bg-transparent border-none cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}
```

(b) Change `PrimaryButton` to accept `fluid`:

```jsx
export function PrimaryButton({ onClick, children, disabled, fluid = false, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-brand-teal text-white text-[13px] font-bold hover:bg-brand-teal-dark motion-safe:transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${fluid ? "w-full" : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

(c) Change `MoreMenu`'s signature to `({ items, label = "More", menuLabel, tile = false })` and its trigger to:

```jsx
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        className={
          tile
            ? TILE_CLASS
            : "inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 motion-safe:transition-colors"
        }
      >
        {tile ? <TileIcon name="dots" /> : null}
        {label}
        {!tile && <Chevron open={open} />}
      </button>
```

Note: `TILE_CLASS` and `MoreMenu` are defined in the same module — declare `TILE_CLASS` ABOVE `MoreMenu` in the file (module-level const, order matters only for readability; both are hoisted-safe as `MoreMenu` reads it at render time, but keep the tile block above `MoreMenu` anyway so the file reads top-down).

(d) Refactor `MarkPaidAction` to reuse the chooser (external API unchanged):

```jsx
export function MarkPaidAction({ booking, onMarkPaid, variant = "primary" }) {
  const [choosing, setChoosing] = useState(false);
  if (choosing) {
    return (
      <PaymentMethodChooser
        onPick={(m) => {
          onMarkPaid(booking, m);
          setChoosing(false);
        }}
        onCancel={() => setChoosing(false)}
      />
    );
  }
  const Trigger = variant === "primary" ? PrimaryButton : SecondaryButton;
  return <Trigger onClick={() => setChoosing(true)}>Mark paid</Trigger>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:component -- parts.component`
Expected: PASS (all existing parts tests + the three new describes).

Also run: `npm run test:component -- today.component`
Expected: PASS — the Now strip's "collected · payment not recorded" path renders `MarkPaidAction` whose chooser is now wrapped in a div; no today test asserts on that structure, so nothing should break. If anything fails here, fix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/today/parts.jsx src/components/views/today/parts.component.test.jsx
git commit -m "feat(today): ActionTile, PaymentMethodChooser and tile MoreMenu primitives"
```

---

### Task 2: Rewire RowDetail to primary + tile bar

**Files:**
- Modify: `src/components/views/today/BookingFeed.jsx` (the `RowDetail` function, currently lines 72–167)
- Test: `src/components/views/today/today.component.test.jsx`

**Interfaces:**
- Consumes from Task 1: `ActionTile`, `PaymentMethodChooser`, `MoreMenu` (`tile` prop), `PrimaryButton` (`fluid` prop) — all imported from `./parts.jsx`.
- Produces: no new exports; `RowDetail` stays internal to `BookingFeed.jsx` with the same props `{ entry, welfare, pay, otw, handlers }`.

Tile sets per state (from the spec — More renders only when it has items):

| State | Primary (full-width) | Tiles | More items |
|---|---|---|---|
| Booked / due | Mark arrived | Message · Booking | Hide until tomorrow (if eligible) |
| Late | Mark arrived | Message · Booking | Didn't show |
| Unconfirmed | Chase confirmation | Arrived · Booking | Hide until tomorrow (if eligible) |
| Checked in | Start groom | Ready · Message · Booking | — |
| In bath | Mark ready | Message · Booking | — |
| Ready, message not sent | Send collection message | Collected · Paid* · Message | Open booking |
| Ready, message sent | Mark collected (→ confirm) | Resend · Paid* · Message | Open booking |
| Collected, owes | Mark paid (→ chooser) | Message · Booking | — |
| Collected, paid | — (quiet row) | Booking · Message | — |

\* Paid tile only when `owesNow`.

- [ ] **Step 1: Update the changed test + add new tests (failing)**

In `src/components/views/today/today.component.test.jsx`, inside `describe("BookingFeed — expanded-row actions …")`:

(a) REPLACE the test `"a plain booked row keeps Message owner one tap away in More"` with:

```jsx
  it("a plain booked row surfaces Message owner and Open booking as tiles", () => {
    const onMessageOwner = vi.fn();
    const onOpenBooking = vi.fn();
    open(base, {}, { onMessageOwner, onOpenBooking });
    expect(screen.getByRole("button", { name: "Mark arrived" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Message owner" }));
    expect(onMessageOwner).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open booking" }));
    expect(onOpenBooking).toHaveBeenCalledWith("x");
  });
```

(b) ADD three new tests to the same describe:

```jsx
  it("the Paid tile appears only when money is owed", () => {
    const { unmount } = open(
      { ...base, id: "r1", status: "Ready for pick-up", collectionSentAt: null },
      { stage: "ready", owes: true },
      { paymentOf: dueOf },
    );
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    unmount();
    open({ ...base, id: "r2", status: "Ready for pick-up", collectionSentAt: null }, { stage: "ready", owes: false });
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("the Paid tile runs the method chooser before recording", () => {
    const onMarkPaid = vi.fn();
    open(
      { ...base, id: "rp", status: "Ready for pick-up", collectionSentAt: null },
      { stage: "ready", owes: true },
      { paymentOf: dueOf, onMarkPaid },
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    expect(onMarkPaid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(onMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: "rp" }), "card");
  });

  it("rare actions never render as tiles — only inside More", () => {
    open(base, { isLate: true, needsAction: true, overdueMinutes: 20 });
    expect(screen.queryByRole("button", { name: "Didn't show" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide until tomorrow" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /More actions for Rex/ }));
    expect(screen.getByRole("menuitem", { name: "Didn't show" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npm run test:component -- today.component`
Expected: FAIL — "a plain booked row surfaces Message owner…" (Message owner is still in More), "the Paid tile appears only when money is owed" (no Mark paid button on a ready row yet). The untouched tests still pass.

- [ ] **Step 3: Rewrite RowDetail**

In `src/components/views/today/BookingFeed.jsx`:

(a) Update the import from `./parts.jsx` — add `ActionTile` and `PaymentMethodChooser`, remove `MarkPaidAction` (no longer used here):

```jsx
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
```

(b) Replace the whole `RowDetail` function with:

```jsx
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
```

Notes for the implementer:
- `MoreMenu`'s wrapper div is `relative`; as a grid item it stretches to the cell and the tile trigger inside is `w-full` via `TILE_CLASS` — nothing extra needed.
- The old `showMarkPaidSecondary` flag disappears: an arrived/ready dog that owes now gets the Paid TILE (`owesNow` push above), which is strictly more visible than the old secondary button.
- `useState` is already imported in `BookingFeed.jsx`.

- [ ] **Step 4: Run the today + parts tests**

Run: `npm run test:component -- today.component parts.component`
Expected: PASS — including the untouched two-step collection test ("Mark collected" tile → confirm → `onMarkCollected` once) and the collected-owes chooser test (primary → "Cash" → `onMarkPaid(…, "cash")`), which work unchanged because accessible names were preserved.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/today/BookingFeed.jsx src/components/views/today/today.component.test.jsx
git commit -m "feat(today): balanced icon action tiles on expanded diary rows"
```

---

### Task 3: Full CI bar, visual check, PR

**Files:**
- No new files; verification + delivery only.

**Interfaces:**
- Consumes: the finished Tasks 1–2 on branch `feat/today-action-tiles`.

- [ ] **Step 1: Run the full CI bar**

Run: `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build`
Expected: all pass. Known exception: ~6 directory tests can fail locally (localStorage isolation) — if ONLY those fail, proceed; CI is the source of truth.

- [ ] **Step 2: Visual check on the offline preview**

Start the `offline` launch config (VITE_FORCE_OFFLINE=1 on :5174 — real staff UI, mock data, no PII). Open `/today` at mobile width (390px). Expand a booked row, a late row, and (if sample data has one) a ready row. Verify:
- one full-width teal primary per row;
- tiles all equal width and height, icon above label;
- More tile (three dots) present only on rows with rare actions, opens the menu;
- tapping Collected shows Confirm collected / Cancel; tapping Paid shows the Paid by: chooser;
- read-only closed-day brief still renders zero buttons.
Screenshot the expanded rows for the PR.

- [ ] **Step 3: Push and open a PR**

```bash
git push -u origin feat/today-action-tiles
gh pr create --title "feat(today): balanced icon action tiles on diary rows" --body "..."
```

PR body: problem (ragged mixed-width buttons on mobile), the chosen option B design (link the spec), the per-state tile table, screenshots from Step 2, and the note that engine/handlers/Now strip are untouched. End with the standard Claude Code attribution line.

- [ ] **Step 4: Verify CI passes on the PR**

Run: `gh pr checks --watch`
Expected: all green. Fix and push if not.
