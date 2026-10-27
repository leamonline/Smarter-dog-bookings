# Buttons: which one to use

Status: Active
Last verified: 2026-10-26

Yellow is the primary action. This page says what the other buttons are, so a new
screen picks the right one and a reviewer can tell when one has been borrowed. It
builds on [warm-colours.md](warm-colours.md), which says yellow means "do this".

| Job | Component | Looks like | Use it for |
| --- | --- | --- | --- |
| The call to action | `<Button variant="primary">` | yellow, charcoal label | The one thing a screen leads with: Book, Add, Save. |
| A strong secondary | `<Button variant="strong">` | charcoal, white label | A confirm or main action that matters but is not the lead: New booking in the header, Send, Confirm. |
| An alternative | `<Button variant="ghost">` | white, grey outline | Cancel, Back, a second option beside a primary. |
| A quiet action | `<Button variant="quiet">` | no fill until hovered | Dismiss, Show more, a toolbar action that should not compete. |
| An inline action | `<Button variant="link">` | underlined text | An action inside a sentence. |
| Destructive | `<Button variant="danger">` | dark coral, white label | Delete, Cancel booking. Say what it does in the label. |
| Icon only | `<IconButton label="…">` | round, no text | A glyph with a required accessible name. |

## Rules
- **One lead per screen.** At most one `primary` in view. `strong` sits beside or
  below it and never competes for the lead. If a screen has no yellow action, the
  `strong` button is the lead.
- **Danger is never the lead**, and never yellow. A destructive confirm is `danger`.
- **Colour is not the only signal.** Every button has a word or, for an icon, a label.
- **Not a Button:** a whole row or card that is clickable, a tab, a toggle chip and
  a dropdown menu row are different shapes and are not forced into `Button`.

## How this is held
`rawButtons.ratchet.test.ts` counts the hand-written `<button>` tags and fails if
the number rises. Moving a hand-written button to `Button` lowers the ceiling.

## Header and customer actions

PageHeaderAction delegates to Button and defaults to strong; pass primary for
the local lead. Customer portal CTA and wizard confirmation use yellow with
charcoal text too; WhatsApp and success greens keep their separate meaning.
Settings SaveButton uses Button, including loading/disabled behaviour.
