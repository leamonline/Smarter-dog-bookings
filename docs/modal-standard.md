# Modal & Dialog Standard

> The canonical structure, accessibility, and token conventions every modal/dialog in this
> app should follow. Derived from the three gold-standard cards —
> [`BookingDetailModal`](../src/components/modals/BookingDetailModal.jsx),
> [`HumanCardModal`](../src/components/modals/HumanCardModal.jsx),
> [`DogCardModal`](../src/components/modals/DogCardModal.jsx) — and their shared primitives.
> When in doubt, open one of those three and match it.

## TL;DR

Build on **`ModalShell`** (which wraps **`AccessibleModal`**). `AccessibleModal` owns the
*behaviour* (focus trap, ESC, scroll-lock, portal, role/aria); `ModalShell` owns the *chrome*
(accent bar, paper surface, pinned header/body/footer, mobile sheet, animation). You supply a
`header`, an optional `footer`, the scrolling body as `children`, a `titleId`, and an `accent`
colour. Never hand-roll a `fixed inset-0` overlay.

---

## 1. The backbone primitives

### `AccessibleModal` — behaviour (do not duplicate this yourself)
[`src/components/shared/AccessibleModal.tsx`](../src/components/shared/AccessibleModal.tsx)

- `react-aria` `useDialog` → `role="dialog"` + `aria-labelledby={titleId}`.
- `<FocusScope contain restoreFocus autoFocus>` → focus trap + focus restore on close.
- ESC-to-close handler, toggleable via **`dismissOnEscape`** (default `true`).
- **Reference-counted** body scroll-lock — safe under stacked/rapid modals (only the *last*
  close unlocks the body). Hand-rolled save/restore scroll-locks are a bug; route through this.
- `createPortal` to `document.body` (escapes ancestor `transform`/`filter` traps).
- Backdrop click-to-close; `aria-modal="true"`; default `zIndex={1000}`.
- Props: `children, onClose, titleId, className, backdropClass, zIndex, dismissOnEscape`.

### `ModalShell` — chrome (the standard wrapper)
[`src/components/modals/shell/ModalShell.jsx`](../src/components/modals/shell/ModalShell.jsx)

- 4px **accent bar** (`<div className="h-1 shrink-0" style={{ background: accent }}>`).
- Paper surface `bg-[var(--color-brand-paper)]` (**`#FAF9F6`**, not pure white).
- `rounded-[20px]`, soft branded shadow `shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)]`.
- **Pinned** header (`shrink-0`) + **scrolling** body
  (`flex-1 min-h-0 overflow-y-auto overscroll-contain`) + **pinned** footer (`shrink-0`, with
  `max-sm:pb-[env(safe-area-inset-bottom)]`).
- Mobile full-screen sheet: `max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none`.
- Entrance `animate-shell-in` (gentle rise ≥sm, slide-up sheet <sm); backdrop
  `bg-[rgba(45,0,75,0.45)] animate-overlay-fade`.
- Props: `onClose, titleId, accent, header, footer, children, widthClass, maxHeightClass,`
  `backdropClass, dismissOnEscape, zIndex, bodyClassName, rootClassName`.

### `PanelShell` — internal section card
[`src/components/modals/shell/PanelShell.jsx`](../src/components/modals/shell/PanelShell.jsx)
Uppercase eyebrow + hairline divider + coloured corner icon chip. `accent ∈`
`slate | teal | amber | emerald | sky | rose`. Use for the section cards *inside* a modal body.

### Header helpers
- [`HeaderIconButton`](../src/components/modals/shell/HeaderIconButton.jsx) — the standard
  header edit/overflow/close/gallery button: `w-11 h-11 lg:w-8 lg:h-8` (44px on phone **and**
  tablet, shrinking to 32px only on `lg+`), `type="button"`, requires `label` (→ `aria-label`).
- [`OverflowMenu`](../src/components/modals/shell/OverflowMenu.jsx) — the shared header "…" menu
  (`role="menu"`, outside-click + ESC close). Items: `{ label, onClick, disabled }`.

---

## 2. Canonical structure

```jsx
<ModalShell
  onClose={requestClose}
  titleId="thing-card-title"        // must match the real <h2 id> in the header
  accent={accentColour}             // status / size / teal — the 4px bar
  widthClass="w-[min(480px,93vw)]"  // pick per modal; default w-[min(820px,95vw)]
  header={<ThingHeader titleId="thing-card-title" onClose={requestClose} … />}
  footer={<ThingActions … />}        // optional; omit for read-only modals
  bodyClassName="px-5 pt-1 pb-2"
  rootClassName="bm-fields"          // opt in to the iOS input-zoom fix if the body has fields
>
  {/* scrolling body: PanelShell sections, etc. */}
</ModalShell>
```

**Header idiom** (lives in the `header` slot, stays pinned):
```jsx
<header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
  <div className="flex-1 min-w-0">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eyebrow</span>
    <h2 id={titleId} className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1 truncate">
      {title}
    </h2>
  </div>
  <div className="flex items-center gap-1.5 shrink-0">
    {/* optional edit, OverflowMenu */}
    <HeaderIconButton label="Close" onClick={onClose}><X size={16} strokeWidth={2.2} aria-hidden="true" /></HeaderIconButton>
  </div>
</header>
```

**Footer idiom** (lives in the `footer` slot, stays pinned):
```jsx
<div className="border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-2.5">
  <button type="button" className="px-4 py-2 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold …">Cancel</button>
  <button type="button" className="ml-auto py-2 px-5 rounded-full bg-action text-on-action hover:bg-brand-yellow-dark text-sm font-bold …">Save changes</button>
</div>
```

---

## 3. Accessibility checklist (every modal)

- [ ] **Wrapper** is `ModalShell` (or `AccessibleModal` for a deliberate non-card variant) — never a raw `fixed inset-0`.
- [ ] `role="dialog"` + `aria-modal="true"` (free via `AccessibleModal`).
- [ ] `aria-labelledby` → a **real `<h2>`** whose `id` === the `titleId` prop. (A `<div id>` is not a heading — use `<h2>`.)
- [ ] **Focus trap** + focus restore on close (free via `FocusScope`).
- [ ] **ESC-to-close** works — or is *deliberately* disabled with `dismissOnEscape={false}` and a documented reason.
- [ ] **Body scroll-lock** via `AccessibleModal`'s reference-counted lock (no hand-rolled overflow save/restore).
- [ ] **44px touch targets** on mobile for every interactive control: icon buttons `max-sm:w-11 max-sm:h-11` (or use `HeaderIconButton`); text buttons `min-h-[44px]`/`py-3`; the `.tap-target` utility for awkward cases.
- [ ] Every `<button>` has an explicit `type="button"` (or `type="submit"` inside a form).
- [ ] Icon-only buttons have an `aria-label`; decorative icons have `aria-hidden="true"`.
- [ ] Async/destructive actions guard against double-fire (disable while in-flight) and keep `error.code`/`P0001` mapping intact on any booking path.

---

## 4. Button & token conventions

| Role | Pattern |
|---|---|
| **Primary CTA** | `rounded-full bg-action text-on-action hover:bg-brand-yellow-dark`, ≥44px tall on mobile, `ml-auto` in a footer |
| **Secondary / Cancel** | `rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 hover:bg-slate-50` |
| **Destructive** | coral/rose: `bg-brand-coral text-white` (or rose-bordered ghost for a softer "Cancel booking") |
| **Header icon button** | `HeaderIconButton` (44px mobile/tablet → 32px `lg+`) |

**Tokens — prefer these over literals:**

| Use | Token | Value |
|---|---|---|
| Modal surface | `bg-[var(--color-brand-paper)]` | `#FAF9F6` |
| Backdrop | `bg-[rgba(45,0,75,0.45)] animate-overlay-fade` | purple-tint |
| Shell shadow | `shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)]` | branded soft |
| Outer radius | `rounded-[20px]` | 20px |
| Control radius | `rounded-control` | `--radius-control: 10px` |
| CTA fill / text | `bg-action` / `text-on-action` | `#FECC13` / `#2D004B` |
| Title text | `text-brand-purple`, `font-display` | — |
| iOS field-zoom fix | `.bm-fields` root class | ≥16px on touch, 13px on fine pointer |

**Flags (divergences to fix):** raw `fixed inset-0`; `bg-white` *modal surface*; `bg-black/xx`
backdrop; `shadow-xl`/`shadow-2xl`; `rounded-2xl`/`rounded-xl` on the *outer box*; hard-coded
hex for brand colours; missing entrance animation.

> Note: `shadow-modal` (`0 8px 32px rgba(0,0,0,0.18)`) and `shadow-elevated` **are** real
> tokens, but they are *not* the gold-standard shell shadow. Use the branded
> `shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)]` (which `ModalShell` already applies for you).

---

## 5. Legitimate variants (not every surface is a centred card)

1. **Drawer / slide-over** (e.g. `OverviewDrawer`, `DaySettingsDrawer`, `SlideOverPanel`) — a
   full-height side panel, not a centred box. It should still reuse `AccessibleModal`'s
   *behaviour* (focus trap, ESC, **reference-counted** scroll-lock, portal, role/aria/titleId)
   while keeping the slide-in layout. A shared **`DrawerShell`** variant is the right home for
   this so the three drawers stop duplicating focus-trap/ESC logic.
2. **Media viewer / lightbox** (e.g. `PhotoLightbox`, `PhotoGalleryModal`) — a dark, image-first
   surface is appropriate; do not force a paper card. Still owes the full a11y checklist
   (focus trap, ESC, role/aria, `titleId`→real heading, scroll-lock, arrow-key nav, `alt` text).
3. **Confirm / action dialog** — small, centred, no accent bar. Use the shared
   [`ConfirmDialog`](../src/components/shared/ConfirmDialog.jsx) where possible; align its chrome
   to paper + `rounded-[20px]` + shell shadow + ≥44px buttons. Bespoke confirm dialogs
   (busy state, an input, a checklist) should match that same look and a11y.
4. **Customer portal** (`src/components/customer/*`) — intentionally its own visual system
   (`--sd-*` tokens, Quicksand font, `.portal-btn`/`.portal-input`). Do **not** repaint these
   with staff-app tokens. Hold them to the *a11y* baseline only (focus trap, ESC, role/aria,
   `titleId`→heading, scroll-lock, 44px targets, `type="button"`).

---

## 6. Quick reference — props you almost always pass

`ModalShell`: `onClose`, `titleId`, `accent`, `header`, `footer?`, `widthClass`,
`maxHeightClass?`, `bodyClassName?`, `rootClassName?` (`"bm-fields"` when the body has inputs),
`dismissOnEscape?` (`false` only for explicit unsaved-changes guards).
