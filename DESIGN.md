# Smarter Dog — Design System

## 1. Visual Theme & Atmosphere

Smarter Dog's design is bright, confident, and full of energy — like a freshly groomed pup bouncing out of the salon. The website and portal are built on bold, full-bleed colour sections that flow into each other through curved wave dividers, creating a sense of movement and warmth. The dominant colour is a vivid cyan blue (`#00C2FF`) that feels modern and approachable, paired with a sunshine-yellow CTA (`#FFCC00`) that pops against every surface.

The typographic system uses **Montserrat** throughout — a geometric, versatile sans-serif that handles both bold display headings and relaxed body text. Headings are set at weight 700 (bold) in large sizes (4xl–6xl), creating confident, punchy statements. Body text sits at weight 400–500 with generous `leading-relaxed` line-height for comfortable reading.

What makes the design distinctive is its **multi-section colour storytelling**. Each major content block sits in its own full-bleed coloured section — cyan for the hero, white for stats, teal for content, coral for accents — with smooth wave transitions between them. Combined with polaroid-style photo treatments, floating decorative circles, and glassmorphism card effects, the result is an interface that feels alive, playful, and genuinely warm.

**Key Characteristics:**
- Vivid cyan blue (`#00C2FF`) as the hero/primary colour — energetic, not corporate
- Full-bleed coloured sections with curved wave dividers between them
- Sunshine yellow (`#FFCC00`) reserved for CTAs — pill-shaped, bold, unmissable
- Montserrat throughout — one font family, weight variation creates hierarchy
- Pill-shaped buttons (`rounded-full`) with `scale(1.05)` hover
- Glassmorphism cards — semi-transparent white, backdrop blur, soft borders
- Polaroid-style photo treatments with slight rotations and handwritten captions
- Floating decorative circles at low opacity for depth and movement
- Warm dark brown text (`#2A1810`) — never pure black
- `active-squish` press interaction on interactive elements

## 2. Colour Palette & Roles

### Primary Brand

- **Cyan Blue** (`#00C2FF`): The brand's hero colour — hero backgrounds, section fills, nav highlights, brand energy. Bright and modern.
- **Cyan Blue 56%** (`rgba(0, 194, 255, 0.565)`): Softened cyan for secondary fills and overlays.
- **Sunshine Yellow** (`#FFCC00`): The single CTA colour — used only for the primary action on any screen. Always bold, always pill-shaped.
- **Yellow 50%** (`rgba(255, 204, 0, 0.5)`): Softened yellow for highlight underlines and decorative accents.

### Accent & Section Colours

- **Teal** (`#2A6F6B`): Secondary actions, content sections, links, and secondary buttons. Earthy and grounding.
- **Teal Light** (`#7AB8A8`): Softer teal for card backgrounds and supporting elements.
- **Coral** (`#E8506A`): Accent sections, danger states, and visual energy breaks. Used as full-bleed section backgrounds.
- **Green** (`#00D94A`): Success states, positive indicators, and accent dots.
- **Orange** (`#FF6B00`): Tertiary accent — used sparingly for variety in section backgrounds and decorative elements.
- **Plum Purple** (`#2D004B`): Reserved for deep-contrast moments — footer backgrounds, dark overlays, text on light surfaces.

### Surface & Background

- **Paper** (`#FAF9F6`): Light section backgrounds and the warm canvas between coloured sections.
- **Paper Warm** (`#FDFCFA` / `rgb(253, 252, 250)`): Slightly warmer variant for subtle alternation.
- **White** (`#FFFFFF`): Card surfaces, stat bars, modal backgrounds.
- **White Translucent** (`rgba(255, 255, 255, 0.7)`): Glassmorphism card fills with backdrop blur.
- **White Subtle** (`rgba(255, 255, 255, 0.15–0.4)`): Overlays, frosted borders, glass effects.

### Text Colours

| Role | Value | Usage |
|------|-------|-------|
| Primary text (dark) | `#2A1810` | Headings and body on light backgrounds — warm dark brown |
| Primary text (light) | `#FFFFFF` | Text on coloured/dark backgrounds |
| Secondary text | `text-gray-600` | Descriptions, metadata, supporting copy |
| Muted text | `text-gray-400` | Timestamps, de-emphasised content |

### Section Colour System

Each major content section uses a full-bleed background colour. Sections transition with curved SVG wave dividers.

| Section | Background | Text | Purpose |
|---------|------------|------|---------|
| Hero | `#00C2FF` | White | First impression, headline, CTA |
| Stats | `#FFFFFF` | Dark brown | Social proof, numbers |
| Services | `#FAF9F6` | Dark brown | Service cards, details |
| Content | `#2A6F6B` | White | Feature highlights, approach |
| Accent | `#E8506A` | White | Visual break, gallery, energy |
| CTA/Booking | `#2D004B` | White | Final call to action |
| Footer | `#2A1810` | White/muted | Navigation, contact, legal |

## 3. Typography Rules

### Font Family

- **Montserrat** — geometric sans-serif used for everything. Headings, body, buttons, labels, navigation. One font, weight and size variation creates the full hierarchy.
- **System monospace** — booking reference codes and OTP inputs only.

### Hierarchy

| Role | Size | Weight | Line Height | Extra | Usage |
|------|------|--------|-------------|-------|-------|
| Hero headline | 5xl–6xl | 600–700 | tight | — | Page hero text ("Come scruffy. Leave gorgeous.") |
| Section heading | 4xl–5xl | 700 | tight | — | Major section titles |
| Card heading | 2xl–3xl | 700 | snug | — | Service names, feature titles |
| Subsection heading | xl | 600 | snug | — | Card subtitles, step labels |
| Body large | lg | 400 | relaxed | — | Intro paragraphs, lead text |
| Body standard | base | 400 | relaxed | — | Standard reading text, descriptions |
| Body small | sm | 400 | relaxed | — | Metadata, captions, fine print |
| Button label | base–lg | 700 | none | — | CTA and action buttons |
| Nav link | sm | 500 | none | — | Header navigation items |

### Principles

- **One font, many weights.** Montserrat handles everything — hierarchy comes from size and weight, not font switching.
- **Bold for authority, regular for reading.** Weight 700 for headings and buttons, 400–500 for body text.
- **Generous line-height.** Body text uses `leading-relaxed` (1.625) for comfortable reading on coloured backgrounds.
- **Large display sizes.** Hero text goes up to 6xl — big, confident statements that own the screen.
- **Class-based separation.** `heading-font` class for display text, `body-font` class for reading text. Both resolve to Montserrat but allow independent styling.

## 4. Component Stylings

### Buttons

All buttons are **pill-shaped** (`rounded-full`), bold weight, with generous padding. The signature interaction is `hover:scale-105` with `active-squish` on press.

**CTA / Primary** (yellow)
- Background: `#FFCC00` / Text: dark (`#2A1810` or `#2D004B`)
- Padding: `px-10 py-4` (large) or `px-5 py-3` (standard)
- Font: bold, lg
- Border-radius: `rounded-full`
- Hover: `scale(1.05)`, `shadow-lg`
- Transition: `all 300ms`

**Secondary** (teal)
- Background: `#2A6F6B` / Text: `#FFFFFF`
- Padding: `px-5 py-3`
- Font: bold, base
- Border-radius: `rounded-full`
- Hover: `scale(1.05)`

**Ghost / Glass**
- Background: `rgba(255, 255, 255, 0.15)` / Text: `#FFFFFF`
- Border: `1px solid rgba(255, 255, 255, 0.4)`
- Backdrop-blur for frosted effect
- Hover: increased opacity

**Pill Badge** (inline)
- Background: colour at 56% opacity
- Padding: `px-3 py-1`
- Font: sm, semibold
- Border-radius: `rounded-full`

**Floating Action Button**
- Fixed bottom-right position
- `w-14 h-14 rounded-full shadow-lg`
- Hover: `scale(1.1)`, `shadow-xl`
- `active-squish` on press

### Cards & Containers

**Glass Card** (primary pattern)
- Background: `rgba(255, 255, 255, 0.6)` or `bg-white/60`
- Backdrop-filter: `blur(8px)` (`backdrop-blur-sm`)
- Border: `1px solid rgba(255, 255, 255, 0.5)` (`border-white/50`)
- Border-radius: `rounded-xl` (12px)
- Shadow: `shadow-sm`, hover: `shadow-md`
- Padding: `p-4`

**Solid Card**
- Background: `#FFFFFF`
- Border-radius: `rounded-2xl` (16px) or `rounded-3xl` (24px)
- Shadow: `shadow-lg` to `shadow-2xl`
- Border: `1px solid gray-100`
- Padding: `p-5` to `p-8`

**Feature Card**
- Background: section colour or white
- Border-radius: `rounded-3xl`
- Padding: `p-8`
- Hover: `shadow-lg`, `hover-lift` class
- Layout: flex row with icon/image and text

**Stats Bar**
- White background, full-width
- Flex row, centred, evenly spaced
- Each stat: large bold number + small label beneath
- Clean, no borders between items

### Navigation

**Header**
- Fixed top, full-width, `z-50`
- Background: transparent (scrolls to frosted white)
- Transition: `all 300ms`
- Logo left, nav links centre, CTA button right
- Nav links: small, weight 500, underline animation on hover (`w-0` to `w-full` bottom border)
- Mobile: hamburger menu with slide-in overlay

### Wave Dividers

SVG-based curved dividers sit between full-bleed sections. They take the colour of the section below and create a smooth, organic transition.

```
Section A (cyan)
  ╰──── wave shape (colour of Section B) ────╯
Section B (white)
```

- Positioned: `absolute bottom-0`, full-width, `overflow-hidden`
- Transform: `translate-y-px` to prevent sub-pixel gaps
- Fill colour matches the next section's background

### Image Treatment

**Polaroid Photos**
- White border/padding creating the polaroid frame effect
- Slight rotation: `rotate-1`, `rotate-6`, `rotate-12` (varies per photo)
- Layered/overlapping layout with z-index stacking
- Shadow: `shadow-layered` for depth
- Handwritten-style captions beneath each photo
- Hover: increased z-index, slight scale

**Dog Photo Gallery**
- Horizontal scrolling carousel
- Rounded images
- Infinite marquee animation for continuous scroll

### Decorative Elements

**Floating Circles**
- Large rounded circles (`w-64 h-64`, `w-80 h-80`) at very low opacity (`opacity-10`, `opacity-20`)
- Positioned absolute, overflowing section bounds
- `animate-float` for gentle bobbing movement
- Add depth and organic feel without cluttering content

**Yellow Underline Accents**
- SVG or pseudo-element yellow highlights under key words in hero text
- `text-yellow-400 opacity-60`
- Hand-drawn/brush stroke style

## 5. Layout Principles

### Content Width

- **Sections**: Full-bleed (100vw) coloured backgrounds
- **Content containers**: `max-w-4xl` (56rem / 896px) or `max-w-lg` (32rem / 512px) centred within sections
- **Hero content**: Left-aligned text with right-aligned photo collage on desktop

### Page Structure

```
┌─────────────────────────────────────────────┐
│ Nav (transparent → frosted on scroll)       │ ← fixed, z-50
│  Logo        Links         CTA Button       │
├─────────────────────────────────────────────┤
│ Hero Section (cyan #00C2FF)                 │ ← full-bleed
│  ┌─────────────┐  ┌─────────────────┐       │
│  │ Headline     │  │ Polaroid photos │       │
│  │ Subtext      │  │ (rotated,       │       │
│  │ [CTA] [Msg]  │  │  overlapping)   │       │
│  └─────────────┘  └─────────────────┘       │
│  ~~~ wave divider ~~~                       │
├─────────────────────────────────────────────┤
│ Stats Section (white)                       │
│  Since 1982 | 10,000+ | 4.9★ | 100%        │
│  ~~~ wave divider ~~~                       │
├─────────────────────────────────────────────┤
│ Services Section (paper #FAF9F6)            │
│  [Service Card] [Service Card] [Service]    │
│  ~~~ wave divider ~~~                       │
├─────────────────────────────────────────────┤
│ Content Section (teal #2A6F6B)              │
│  ~~~ wave divider ~~~                       │
├─────────────────────────────────────────────┤
│ Accent Section (coral #E8506A)              │
│  Photo gallery / testimonials               │
│  ~~~ wave divider ~~~                       │
├─────────────────────────────────────────────┤
│ CTA Section (purple #2D004B)                │
│  Book your visit + process steps            │
├─────────────────────────────────────────────┤
│ Footer (dark brown #2A1810)                 │
│  Logo, links, hours, contact                │
└─────────────────────────────────────────────┘
```

### Spacing Scale

| Token | Size | Usage |
|-------|------|-------|
| Tight | 4px (`gap-1`) | Icon gaps, inline badge padding |
| Related | 8px (`gap-2`) | Items within a group, nav link gaps |
| Comfortable | 12px (`gap-3`) | Card content gaps, pill badge spacing |
| Standard | 16px (`gap-4`, `p-4`) | Card padding, section internal gaps |
| Roomy | 20px (`p-5`) | Card padding on feature cards |
| Spacious | 24px (`p-6`, `gap-6`) | Section padding, card group gaps |
| Section | 32px (`p-8`) | Feature card padding, large section spacing |
| Page section | 64px–96px (`py-16`–`py-24`) | Vertical padding on full-bleed sections |

### Animation System

**Entrance: Fade In Up**
```css
.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(32px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Elements start with `opacity-0 translate-y-8` and animate in on scroll/load.

**Floating Decorative Elements**
```css
.animate-float {
  animation: float 6s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-20px); }
}
```

**Active Squish** (button press)
```css
.active-squish:active {
  transform: scale(0.95);
  transition: transform 80ms ease;
}
```

**Hover Lift** (cards)
```css
.hover-lift:hover {
  transform: translateY(-4px);
  transition: all 300ms ease;
}
```

### Border Radius Scale

| Size | Value | Tailwind | Usage |
|------|-------|----------|-------|
| Pill | 9999px | `rounded-full` | Buttons, badges, pills, FAB |
| Large | 24px | `rounded-3xl` | Feature cards, hero containers |
| Standard | 16px | `rounded-2xl` | Content cards, modals, cookie banners |
| Comfortable | 12px | `rounded-xl` | Glass cards, smaller containers |
| Small | 8px | `rounded-lg` | Input fields, compact elements |

## 6. Depth & Elevation

### Shadow System

| Level | Tailwind | Usage |
|-------|----------|-------|
| Subtle | `shadow-sm` | Glass cards at rest, nav links |
| Standard | `shadow-md` | Cards on hover, active states |
| Raised | `shadow-lg` | CTA buttons on hover, floating elements |
| Prominent | `shadow-xl` | FAB on hover, featured cards |
| Dramatic | `shadow-2xl` | Modals, hero cards, cookie banner |

### Shadow Style

The website uses Tailwind's built-in shadow scale rather than custom brand-coloured glows. Shadows are neutral and subtle — the colour comes from the backgrounds, not the shadows.

Exception: the inset shadow pattern on hero sections adds subtle depth:
```css
box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
```

### Glassmorphism

The signature depth effect is glassmorphism — semi-transparent white cards with backdrop blur that let the coloured section background show through.

```css
background: rgba(255, 255, 255, 0.6);
backdrop-filter: blur(8px);
border: 1px solid rgba(255, 255, 255, 0.5);
```

This creates layered depth without heavy shadows.

## 7. Responsive Behaviour

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | < 768px | Single column, stacked hero, hamburger nav, smaller headings (4xl), polaroid photos scale down (`scale-[0.6]`), bottom mobile nav bar appears |
| Tablet/Desktop | 768px+ (`md:`) | Two-column hero, side-by-side cards, full nav bar, full-size photos, larger headings (5xl–6xl) |

### Touch Targets

- CTA buttons: `px-10 py-4` — generous thumb target
- Nav links: adequate spacing with `gap-6`
- Secondary buttons: `px-5 py-3`
- FAB: `w-14 h-14` (56px) — easy to tap
- All interactive elements: minimum 44x44px

### Mobile Navigation

- Fixed bottom nav bar (`md:hidden`) with key actions (Book, Call, Message)
- Frosted/glass background with `backdrop-blur-md`
- `rounded-2xl` container with shadow
- `pointer-events-auto` to capture taps through the overlay

### Collapsing Strategy

- **Hero:** Side-by-side (text + photos) → stacked (text above, photos below)
- **Service cards:** Row → single column stack
- **Stats bar:** Horizontal row stays horizontal, text sizes reduce
- **Polaroid photos:** Scale down to 60% on mobile, maintain rotation
- **Section padding:** Reduces from `py-24` to `py-16` on mobile

## 8. Do's and Don'ts

### Do

- Use full-bleed coloured sections with wave dividers to create visual flow
- Use Montserrat for everything — weight and size create hierarchy, not font switching
- Use `rounded-full` for all buttons — pill shape is the brand signature
- Use `hover:scale-105` on interactive elements — energetic, not subtle
- Use glassmorphism (`bg-white/60 backdrop-blur-sm border-white/50`) for cards on coloured backgrounds
- Use polaroid-style treatments for dog photos — rotations, layering, handwritten captions
- Use floating decorative circles at low opacity for organic depth
- Use warm dark brown (`#2A1810`) for text on light surfaces — never pure black
- Use the section colour system to create rhythm and variety through the page
- Use `animate-fade-in-up` for scroll-triggered entrance animations
- Use `active-squish` on all tappable elements
- Keep CTA buttons yellow (`#FFCC00`) and pill-shaped
- Use UK English throughout (colour, organise, behaviour, cancelled)

### Don't

- Don't use flat, single-colour page backgrounds — the design thrives on coloured sections and transitions
- Don't use rectangular buttons — everything interactive is pill-shaped (`rounded-full`)
- Don't use pure black (`#000000`) for text — use warm dark brown (`#2A1810`) or purple (`#2D004B`)
- Don't use heavy custom shadows — stick to Tailwind's shadow scale and glassmorphism
- Don't skip wave dividers between major sections — they create the organic flow
- Don't use more than one yellow CTA per visible viewport — it dilutes the signal
- Don't flatten photos into plain rectangles — use polaroid treatment, rotation, and layering
- Don't mix font families — Montserrat handles everything
- Don't use small, timid heading sizes — hero and section titles should be 4xl minimum
- Don't animate layout properties (width, height, padding) — only `transform` and `opacity`
- Don't use left-border accent cards on the website — that pattern belongs to the portal app only

## 9. Agent Prompt Guide

### Role & Stack

> You are building UI for Smarter Dog, a dog grooming salon's website and customer-facing booking portal. The stack is HTML/CSS/JS with Tailwind CSS, using Montserrat as the sole typeface. The design uses full-bleed coloured sections, glassmorphism cards, pill-shaped buttons, and polaroid-style photo treatments.

### Five Rules for Consistent Output

1. **Full-bleed coloured sections.** Every major content block sits in a coloured section (`#00C2FF`, `#2A6F6B`, `#E8506A`, `#FAF9F6`, `#2D004B`, `#2A1810`). Sections connect with SVG wave dividers.
2. **Montserrat everywhere.** Headings at weight 700 in large sizes (4xl–6xl). Body at weight 400 with `leading-relaxed`. Use `heading-font` and `body-font` classes.
3. **Pill buttons, always.** Every button uses `rounded-full`. CTAs are yellow (`#FFCC00`), secondary is teal (`#2A6F6B`). Hover: `scale(1.05)`. Press: `active-squish`.
4. **Glassmorphism cards.** Cards on coloured backgrounds use `bg-white/60 backdrop-blur-sm border-white/50`. Cards on white/paper use solid white with `rounded-2xl shadow-lg`.
5. **Polaroid photos.** Dog photos get a white border frame, slight rotation (`rotate-1` to `rotate-12`), layered z-index stacking, and handwritten-style captions.

### Brand Voice Guidance

Customer-facing copy should be warm, first-person plural ("we"), and conversational — like chatting to a friend who happens to be brilliant with dogs. Follow the pattern:

- **Reassure** — acknowledge the situation ("We've got this sorted for you")
- **Inform** — state what happened or will happen ("Your appointment is confirmed for...")
- **Close warmly** — offer help and sign off ("If you need anything, just get in touch. — Smarter Dog")

Use UK English throughout (colour, organise, behaviour, cancelled).

### Quick Token Reference

Copy-paste this into any agent prompt for fast reference:

```
COLOURS
  Cyan (hero):         #00C2FF
  Yellow (CTA):        #FFCC00
  Teal (secondary):    #2A6F6B
  Teal light:          #7AB8A8
  Coral (accent):      #E8506A
  Green (success):     #00D94A
  Orange (tertiary):   #FF6B00
  Purple (deep):       #2D004B
  Paper (light bg):    #FAF9F6
  Dark brown (text):   #2A1810
  White:               #FFFFFF

FONT
  Montserrat (all uses)
  Headings: 700 weight, 4xl–6xl
  Body: 400 weight, base–lg, leading-relaxed

BUTTONS
  Shape: rounded-full (pill)
  CTA: bg-[#FFCC00] text-dark, px-10 py-4, font-bold
  Secondary: bg-[#2A6F6B] text-white, px-5 py-3
  Hover: scale(1.05), shadow-lg
  Press: active-squish (scale 0.95)

CARDS
  Glass: bg-white/60 backdrop-blur-sm border-white/50 rounded-xl
  Solid: bg-white rounded-2xl shadow-lg
  Feature: rounded-3xl p-8 hover-lift

RADIUS
  Buttons: rounded-full
  Cards: rounded-2xl or rounded-3xl
  Glass cards: rounded-xl
  Inputs: rounded-lg
```

### Example Component Prompts

- "Create a hero section with cyan blue (`#00C2FF`) full-bleed background. Large Montserrat heading at 5xl bold white. Yellow pill CTA button. Polaroid dog photos on the right, rotated and layered. Floating decorative circles at 10% opacity. Wave divider at the bottom transitioning to white."
- "Build a services card grid on paper background. Each card: solid white, `rounded-2xl`, `shadow-lg`, `p-6`. Service icon top, Montserrat heading at 2xl bold, body text at base relaxed, teal pill button at the bottom. Hover: `shadow-xl` + `hover-lift`."
- "Design a testimonial section on coral (`#E8506A`) background. White text, glass cards with `bg-white/60 backdrop-blur-sm`. Reviewer name in bold, quote in italic. Star rating. Wave divider to the next section."

---

## Appendix A: Customer Portal (Booking App)

The customer portal is a focused, single-column booking interface. It shares the brand colours and font but uses a simpler, more contained layout appropriate for form-heavy flows.

### Portal-Specific Patterns

- **Layout:** 560px max-width, centred, single column
- **Background:** Paper (`#FAF9F6`) — the warm canvas
- **Cards:** White with left-border accents (purple = primary, teal = secondary, yellow = attention, muted grey = past)
- **Buttons:** Still pill-shaped, but contained within the narrow layout
- **Typography:** Montserrat throughout, matching the website hierarchy
- **Inputs:** White background, `rounded-lg`, 2px border `stone-200`, focus shifts to purple
- **Status pills:** `rounded-md`, small, bold, colour-coded per status

### Portal Card System

```css
.portal-card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 20px 22px;
  margin-bottom: 16px;
  border-left: 3px solid #2D004B; /* default purple */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
```

Accent variants change only the left-border colour:
- `.portal-card--teal`: `3px solid #2A6F6B`
- `.portal-card--yellow`: `3px solid #FFCC00`
- `.portal-card--muted`: `3px solid #CBD5E1`

### Portal vs Website

| Aspect | Website | Portal |
|--------|---------|--------|
| Layout | Full-bleed sections, multi-column | 560px single column |
| Background | Coloured sections with waves | Paper canvas |
| Cards | Glass / rounded-2xl / shadow-lg | Left-border accent / rounded-xl |
| Depth | Glassmorphism, floating circles | Subtle shadows, flat |
| Photos | Polaroid with rotation | Simple rounded corners |
| Energy | High — bold, playful, dynamic | Calm — focused, functional |

---

## Appendix B: Staff Dashboard Theme

The staff dashboard is a separate design system optimised for data-dense, all-day use by salon staff.

### Colours

| Role | Hex | Token |
|------|-----|-------|
| Primary action | `#0EA5E9` | `brand-blue` |
| Primary hover | `#0284C7` | `brand-blue-dark` |
| Danger | `#E8567F` | `brand-coral` |
| Danger surface | `#FDE2E8` | `brand-coral-light` |
| Secondary accent | `#2D8B7A` | `brand-teal` |
| Background | `#F8FAFC` | `slate-50` |
| Primary text | `#1E293B` | `slate-800` |
| Secondary text | `#475569` | `slate-600` |
| Muted text | `#94A3B8` | `slate-400` |
| Borders | `#E2E8F0` | `slate-200` |

The dashboard uses Tailwind's cool **slate** scale, not the warm stone scale.

### Typography

System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. No custom fonts — optimised for rendering speed on data-heavy views.

### Layout

- Max-width: 900px centred
- Primary view: week calendar with 2-column slot grid
- Navigation: tab-based toolbar (Bookings / Dogs / Humans / Stats)
- Dense card layout with size-coded gradient headers

### Key Rule

**Never mix website, portal, and dashboard design systems.** Website = coloured sections, glassmorphism, pill buttons, Montserrat. Portal = paper canvas, left-border cards, contained layout. Dashboard = slate, system fonts, dense data views.
