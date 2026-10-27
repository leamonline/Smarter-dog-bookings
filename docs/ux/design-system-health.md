# Design-system health

Status: Active
Last verified: 2026-10-26

Six counts track how much of the app still bypasses the design system. Each has
a ceiling that may only go down. One command shows them all.

```bash
npm run check:design-system             # every count against its ceiling
npm run check:design-system -- --lower  # also write lower ceilings back
```

The report exits 1 if any count is above its ceiling, so it can sit in a script
or a check. It prints "below by N: can lower" when a count has fallen under its
ceiling; `--lower` then writes the new, lower ceilings and lists what it changed.
Review that diff and commit it with the change that earned it.

| Ratchet | Counts | Use instead |
| --- | --- | --- |
| Raw form controls | `<input>`, `<textarea>`, `<select>` outside the kit | `Input`, `Textarea`, `Select` in a `Field` |
| Hand-written buttons | `<button>` outside the kit; and those on the old `.btn` classes | `Button`, `IconButton` ([buttons.md](buttons.md)) |
| Hard-coded colours | hex, `rgb()`, `hsl()` in components | a token ([warm-colours.md](warm-colours.md)) |
| Off-scale radius and shadow | `shadow-[…]`, `rounded-[…]`, stock `rounded-2xl` and `rounded-xl` | [radius-and-elevation.md](radius-and-elevation.md) |
| Small text | `text-[Npx]` under 12px, and 12, 13, 14, 16px where a name exists | a named text size |
| Hand-rolled dialogs | `role="dialog"`, `aria-modal` or a `fixed inset-0` overlay outside the kit | `ModalShell` or `AccessibleModal` |
| Menu rows and toggle pills | `role="menuitem"` and `aria-pressed` outside the kit | `MenuItem` and `ToggleChip` |

## The rules
- **Never raise a ceiling to fit a feature.** Use the shared piece. `--lower` is
  built so it cannot raise one either.
- **A count that rises fails the test**, with the files that account for it.
- **Some counts are deliberate and stay above zero**: for example the small-text
  exceptions on the phone-first booking card, and the colour files listed in
  `ALLOWED_COLOUR_FILES`. They are counted so the list can only shrink.

## Where it lives
Counting rules and ceilings are in
[`src/designSystemHealth/ratchets.ts`](../../src/designSystemHealth/ratchets.ts), read by
both the ratchet tests and the command, so they cannot disagree. Each ratchet's
test sits beside it in `src/` and also tests its own scanner, because a counter
that miscounts is worse than none.

To add a ratchet: add its counter, measure function and ceilings to that file,
register it in `RATCHETS`, and write a test that imports it.
