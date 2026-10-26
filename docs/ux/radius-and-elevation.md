# Radius and elevation: one scale

Status: Active
Last verified: 2026-10-26

The staff screens had two ways to say the same thing in two places: a card was
`rounded-xl` (12px) in 23 places and `rounded-2xl` (16px) in 25, a field was
`rounded-lg` (8px) in 23 and `rounded-control` (10px) in 11, and 45 shadows were
typed by hand as `shadow-[…]`, eight of them identical copies of a token that
already existed. This names the scale so a surface has one right answer.

## Radius

| Job | Class | Value | Notes |
|---|---|---|---|
| Field, button-sized control | `rounded-control` | 10px | `Input`, `Select`, `Textarea` already use it. |
| Card, panel, anything that holds content | `rounded-card` | 16px | One edit in `index.css` (`--radius-card`) changes every card. |
| Tile: a compact row, inner panel or list item | `rounded-tile` | 12px | One step under a card so nested corners stay visibly nested. |
| Pill, chip, avatar, icon button | `rounded-full` | 9999px | `Button` and `IconButton` are pills. |

Not on the scale for new code: `rounded-md` (6px), `rounded-lg` (8px), a bare
`rounded` (4px) and `rounded-[…]`. `rounded-2xl` is exactly 16px, so it is written
`rounded-card`, and `rounded-xl` is exactly 12px, so it is written `rounded-tile`;
the ratchet enforces both outside the customer portal.

Choosing between them: a surface that holds content and stands on its own (a day
card, a report section, a modal panel) is a card. A row in a list, a notice strip
or a tile inside a card is a tile. When a card is promoted from tile to card the
pixels change (12 to 16), so that is done a screen at a time. A small inner element (a tag inside a card) may
legitimately be smaller than its card; if so, say why in a comment.

The customer portal keeps its own `--radius-sd-*` names. Do not merge the two
stylesheets (CLAUDE.md).

## Elevation

Three levels, each already a token:

| Level | Use | Class |
|---|---|---|
| Rest | a card sitting on the page | `shadow-card-resting` |
| Raised | a dropdown, popover, hovered card | `shadow-elevated` |
| Overlay | a modal or drawer | `shadow-modal` |

Call-to-action glows (`shadow-cta-yellow`) and the portal's `shadow-sd-*` are
separate on purpose and stay. Do not type a shadow as `shadow-[…]`; if none of
the three fits, that is a design question to raise, not a value to invent.

## How this is held

`src/offScaleRadiusShadow.ratchet.test.ts` counts the hand-typed `shadow-[…]` and
`rounded-[…]` utilities, and any stock `rounded-2xl` or `rounded-xl`, in components
and fails if any rises. Lower a ceiling
when you replace one with a token; never raise it.

Migrating the stock `rounded-xl` / `rounded-2xl` cards to `rounded-card` and the
8px fields to `rounded-control` changes pixels (12 to 16 on about half the
cards, 8 to 10 on fields), so it is done in slices a screen at a time and looked
at, not in one sweep.
