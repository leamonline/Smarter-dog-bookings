# Warm colours: what each one means

Status: Draft, proposed 25 October 2026. Describes the palette as it is in
`src/index.css`; it changes no colour.

Yellow, gold and mustard sit within a few shades of each other, and the same
family does seven different jobs. The rule that holds the system together is
**yellow means "do this"**. This page says what every neighbour means, so a new
screen can pick the right one and a reviewer can tell when one has been
borrowed.

| Job | Token | Value | Use it for | Never use it for |
| --- | --- | --- | --- | --- |
| Action | `color-brand-yellow` | `#FECC13` | The primary button, with a charcoal label | Warnings, status, decoration that looks clickable |
| Action hover | `color-brand-yellow-dark` | `#D4A500` | Primary button hover, small-dog dot border | Text, or a focus ring (focus is charcoal) |
| Small dog | `color-size-small` | `#F5C518` | The small `SizeDot` fill and its size accents, always with the letter S | A button, or a second kind of "good" |
| Small-dog wash | `size-small-tint` | `#FFF8E0` | Small-dog card and header wash | Any background that should read as a notice |
| Ready for collection | `status-ready-tint` / `-edge` | `#F7E6BE` / `#B8860B` | The Ready status badge and the edge rule on that card | Text; a general "attention" tint |
| Unknown status | `status-unknown-tint` | `#FFF7DC` | A status the system does not recognise, so bad data gets noticed | Anything expected, including empty or pending states |
| Waitlist, waiting | `color-brand-mustard` (+ `-tint`, `-paper`) | `#B8860B` | The waitlist tab, tags and notes: edges, icons and borders | Text (3.25:1 on white) |

## Warnings are not yellow

`color-feedback-warning` used to resolve to `color-brand-yellow`, which broke
the rule above: a warning that is the same yellow as the Book button reads as
something to press. It now resolves to `color-brand-mustard` (edges and icons),
with `color-feedback-warning-tint` and `color-feedback-warning-ink` for the
notice itself. Never fill a warning with `color-brand-yellow`; add a warning
triangle and say what is wrong in words. The app's existing amber warnings are
a separate clean-up.

## Picking quickly

- A thing the person can do: yellow.
- A dog's size: the size colour plus the letter.
- A booking's state: `BookingStatusBadge`, never a hand-picked tint.
- Something waiting on someone: mustard edge, with the word "Waitlist" or "Pending".
- Something wrong with the data: unknown tint, ink and a sentence.

Colours that carry operational meaning (`status-*`, `color-size-*`, `size-*`)
stay frozen. This page is about not borrowing them, not about changing them.
