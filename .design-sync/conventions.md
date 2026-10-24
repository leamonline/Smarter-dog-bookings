## Smarter Dog UI Kit — conventions

**No provider or root wrapper is required.** Every component here is a plain,
self-contained function component — no theme context, no router, no i18n
provider to set up. Drop any component straight onto the page once
`styles.css` and `_ds_bundle.js` are loaded; nothing else is needed for it to
render fully styled.

### Styling idiom: Tailwind v4 utility classes, brand tokens only

This is a Tailwind (v4, CSS-first `@theme`) design system, not a props-driven
or CSS-in-JS one. Components style themselves internally via hardcoded
Tailwind class strings — you don't pass style props to change colour or
spacing. When you compose NEW layout/glue markup around these components
(page wrappers, grids, spacing between them), use the salon's own brand
utility classes so new UI matches, rather than inventing arbitrary hex/pixel
values:

| Purpose | Classes / tokens |
|---|---|
| Primary CTA colour | `bg-brand-yellow` / `text-brand-purple` (primary button uses this pairing — mustard-on-ink, not blue) |
| Danger / destructive | `bg-brand-coral-dark text-white` (hover `bg-brand-coral-deep`); use bright coral only as an accent |
| Success / confirmed | `bg-brand-green-*` (numbered 50–900 scale) |
| Size semantics | `--color-size-small` (yellow), `--color-size-medium` (teal), `--color-size-large` (coral) — used by `SizeDot`/`SizeTag`, keep this mapping if you build new size UI |
| Body ink | `text-ink` / `text-ink-muted` (charcoal and accessible staff grey). Do not use placeholder tokens for required text |
| Card surface | `bg-white border border-slate-200 rounded-2xl shadow-card-resting` (what `<Card>` renders — reuse this recipe for any new card-like surface instead of `shadow-md`) |
| Form-control radius | `rounded-control` (10px — the codified value for inputs/buttons; not `rounded-md`/`rounded-xl`) |
| Motion | `duration-[var(--duration-base)]` (180ms — the standard interactive-transition speed) |

Fonts: **Montserrat** is body/UI (`font-sans`), **Poppins** is
display/headings (`font-display`), **Barlow Condensed** is for selected hero lines
(`font-hero`), and **Caveat** is an optional handwriting accent.
Rebuild this bundle after token/font changes. Don't
introduce a different font family for new text.

**A class you invent that no existing component already uses may not be
compiled into this bundle's CSS** (see `_ds_bundle.css` — it's the app's real
compiled Tailwind output, not a full utility generator). Prefer the classes
already visible in these components' own source/previews over a fresh
arbitrary value; if you need a truly new value, expect to double-check it
renders rather than assume every Tailwind utility is available.

### Accessible interaction defaults

- Use `--color-border-focus` (charcoal on light surfaces) and a white outline on dark headers. Selection must not rely on a decorative yellow line alone.
- Inline links are underlined without hover; colour alone is insufficient. The canonical `Button` link variant is underlined.
- On touch devices, use at least a 44px hit area for icon-only actions. Use `.tap-target` where a component does not otherwise provide that floor.
- Use 12px or larger for useful metadata on small screens; the named micro and caption typography steps grow at narrow widths. Form controls are 16px on touch to prevent iOS focus zoom.
- Alert chips select style by semantic `tone` (`behaviour`, `caution`, `information`), never by a specific hex value.
- `--color-brand-purple` remains a compatibility alias for charcoal `--color-brand-ink`; do not use the old name in new work.

### Where the truth lives

- `styles.css` → `@import`s `_ds_bundle.css` (all compiled component CSS +
  brand tokens as CSS custom properties, e.g. `--color-brand-yellow`,
  `--color-brand-purple`) and the font `@font-face` rules. Read
  `_ds_bundle.css` directly to see every real token/class before styling
  new markup.
- `components/<group>/<Name>/<Name>.prompt.md` — real usage examples per
  component (ported from these components' own preview stories, e.g. the
  Button variants, the EmptyState + action composition).
- Groups (`actions`, `surfaces`, `status`, `feedback`, `layout`, `data`,
  `loading`) are this kit's own categorisation — a booking-app dashboard
  vocabulary (bookings, dogs, safety alerts, WhatsApp inbox), not a generic
  component-library taxonomy.

### Example: composing with the kit's own idiom

```jsx
const { Card, PageHeader, PageHeaderAction, Badge, StatusPill } = window.SmarterDogUI;

<div className="max-w-3xl mx-auto p-6 flex flex-col gap-4">
  <PageHeader
    title="Dogs"
    subtitle="248 dogs on file"
    actions={<PageHeaderAction>Add dog</PageHeaderAction>}
  />
  <Card interactive accent="#FECC13">
    <div className="flex items-center justify-between">
      <span className="font-bold text-brand-purple">Bella</span>
      <StatusPill state="human_takeover" />
    </div>
    <Badge tone="success" size="sm">Confirmed</Badge>
  </Card>
</div>
```
