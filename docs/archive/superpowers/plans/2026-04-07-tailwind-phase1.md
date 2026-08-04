# Tailwind Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Tailwind CSS v4, configure the design system with brand tokens, build a responsive layout shell, and rewrite AppToolbar with bottom tab bar on mobile.

**Architecture:** Tailwind v4 uses CSS-based configuration via `@theme` blocks — no `tailwind.config.js`. The Vite plugin handles compilation. Existing inline-style components are preserved; they coexist with Tailwind classes during the phased migration. The `md` breakpoint (768px) is the primary mobile/desktop split.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite`, React 19, Vite.

**Spec:** `docs/superpowers/specs/2026-04-07-tailwind-phase1-foundation.md`

---

### Task 1: Install Tailwind CSS and Configure Vite

**Files:**
- Modify: `vite.config.js`
- Create: `src/index.css`
- Modify: `index.html`

- [ ] **Step 1: Install Tailwind and the Vite plugin**

```bash
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add the Tailwind plugin to vite.config.js**

In `vite.config.js`, add the import at the top and the plugin to the array:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "react-vendor";
          }

          if (id.includes("node_modules/@supabase/supabase-js")) {
            return "supabase";
          }

          if (id.includes("/src/components/views/")) {
            return "views";
          }

          if (id.includes("/src/components/modals/")) {
            return "modals";
          }
        },
      },
    },
  },
});
```

- [ ] **Step 3: Create src/index.css with Tailwind import and theme tokens**

Create `src/index.css`:

```css
@import "tailwindcss";

@theme {
  /* Brand accent colours */
  --color-brand-blue: #0EA5E9;
  --color-brand-blue-dark: #0284C7;
  --color-brand-coral: #E8567F;
  --color-brand-coral-light: #FDE2E8;
  --color-brand-teal: #2D8B7A;
  --color-brand-green: #16A34A;
  --color-brand-red: #DC2626;

  /* Size dot colours */
  --color-size-small: #F5C518;
  --color-size-medium: #2D8B7A;
  --color-size-large: #E8567F;
}

/* Body reset */
body {
  margin: 0;
  background-color: theme(--color-slate-50);
}
```

- [ ] **Step 4: Link the CSS in index.html**

In `index.html`, add a CSS link inside `<head>`, before the closing `</head>` tag:

Find:
```html
    <title>SmarterDog — Salon Bookings</title>
  </head>
```

Replace with:
```html
    <title>SmarterDog — Salon Bookings</title>
    <link rel="stylesheet" href="/src/index.css" />
  </head>
```

- [ ] **Step 5: Verify the build**

```bash
node node_modules/.bin/vite build
```

Expected: clean build with no errors. Tailwind CSS will be included in the output. The app should still look the same (dark body is now slate-50, but inline styles on the container still override).

- [ ] **Step 6: Commit**

```bash
git add vite.config.js src/index.css index.html package.json package-lock.json
git commit -m "feat: install Tailwind CSS v4 with Vite plugin and brand theme tokens"
```

---

### Task 2: Update App.jsx Root Container to Tailwind Classes

**Files:**
- Modify: `src/App.jsx`

Replace the inline-styled root container `<div>` with Tailwind classes. There are two instances — the loading state and the main render.

- [ ] **Step 1: Update the loading state container**

In `src/App.jsx`, find the loading return (around line 288-302):

```jsx
    return (
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "20px 16px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <LoadingSpinner />
      </div>
    );
```

Replace with:

```jsx
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 font-sans">
        <LoadingSpinner />
      </div>
    );
```

- [ ] **Step 2: Update the main render container**

Find the main render return (around line 306-315):

```jsx
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: BRAND.text,
        padding: "20px 16px",
      }}
    >
```

Replace with:

```jsx
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 font-sans text-slate-800 pb-20 md:pb-5">
```

Note: `pb-20 md:pb-5` adds bottom padding on mobile to clear the fixed bottom tab bar (80px), reverting to normal padding on desktop.

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173`. The page background should now be light grey (#F8FAFC). The container should be wider (max 1024px instead of 900px). All content should still render — inline-styled components are unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: replace App.jsx root container inline styles with Tailwind classes"
```

---

### Task 3: Rewrite AppToolbar — Desktop Top Bar

**Files:**
- Rewrite: `src/components/layout/AppToolbar.jsx`

Full rewrite of AppToolbar using Tailwind classes. This task builds the desktop (md+) layout. Task 4 adds the mobile bottom tabs.

- [ ] **Step 1: Rewrite AppToolbar.jsx**

Replace the entire contents of `src/components/layout/AppToolbar.jsx` with:

```jsx
import { useState, useRef, useEffect } from "react";

// ── Nav items ───────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Bookings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="9" y1="4" x2="9" y2="10" />
        <line x1="15" y1="4" x2="15" y2="10" />
      </svg>
    ),
  },
  {
    key: "dogs",
    label: "Dogs",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="7.5" cy="5.5" r="2" />
        <circle cx="16.5" cy="5.5" r="2" />
        <circle cx="5" cy="11" r="1.8" />
        <circle cx="19" cy="11" r="1.8" />
        <ellipse cx="12" cy="14" rx="5" ry="4.5" />
      </svg>
    ),
  },
  {
    key: "humans",
    label: "Humans",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
  {
    key: "stats",
    label: "Stats",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="14" width="4" height="7" rx="1" />
        <rect x="10" y="9" width="4" height="12" rx="1" />
        <rect x="16" y="4" width="4" height="17" rx="1" />
      </svg>
    ),
  },
];

// ── Menu items (hamburger dropdown) ─────────────────────────────
const MENU_ITEMS = [
  { key: "reports", label: "Reports", icon: "📊" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

export function AppToolbar({
  activeView,
  setActiveView,
  onSignOut,
  isOnline,
  user,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isMenuViewActive = activeView === "reports" || activeView === "settings";

  return (
    <>
      {/* ── Desktop top bar (md+) + Mobile slim top bar ── */}
      <div className="mb-4 flex items-center gap-4">
        {/* Logo */}
        <div
          className="shrink-0 cursor-pointer"
          onClick={() => setActiveView("dashboard")}
        >
          <div className="text-2xl font-extrabold text-slate-800">
            Smarter<span className="text-brand-blue">Dog</span>
          </div>
        </div>

        {/* Desktop nav tabs — hidden on mobile */}
        <div className="hidden md:flex gap-0.5 bg-slate-100 p-1 rounded-lg shrink min-w-0">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition-all border-none cursor-pointer whitespace-nowrap font-[inherit] ${
                  isActive
                    ? "bg-white text-brand-blue shadow-sm"
                    : "bg-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Hamburger menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={`w-9 h-9 rounded-lg border-[1.5px] flex items-center justify-center cursor-pointer transition-all text-lg font-[inherit] ${
              menuOpen || isMenuViewActive
                ? "border-brand-blue-dark bg-sky-50 text-brand-blue-dark"
                : "border-slate-200 bg-white text-slate-500 hover:border-brand-blue-dark hover:text-brand-blue-dark"
            }`}
          >
            ☰
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute top-11 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px] overflow-hidden animate-[fadeIn_0.12s_ease-out]">
              {MENU_ITEMS.map((item) => {
                const isActive = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { setActiveView(item.key); setMenuOpen(false); }}
                    className={`flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm text-left transition-colors font-[inherit] ${
                      isActive
                        ? "font-bold text-brand-blue-dark bg-sky-50"
                        : "font-semibold text-slate-800 bg-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}

              {isOnline && user && (
                <>
                  <div className="h-px bg-slate-200 mx-3" />
                  <button
                    onClick={() => { onSignOut(); setMenuOpen(false); }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-sm font-semibold text-brand-coral bg-transparent hover:bg-brand-coral-light transition-colors text-left font-[inherit]"
                  >
                    <span className="text-base">🚪</span>
                    Log out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile bottom tab bar (below md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 border-none cursor-pointer bg-transparent font-[inherit] transition-colors ${
                  isActive ? "text-brand-blue" : "text-slate-400"
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-bold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
```

**Key changes from the old AppToolbar:**
- All inline styles replaced with Tailwind classes
- `BRAND` import removed entirely
- Desktop nav tabs hidden on mobile via `hidden md:flex`
- New mobile bottom tab bar via `md:hidden fixed bottom-0`
- NAV_ITEMS now include inline SVG icons for the bottom bar
- Hover states use Tailwind `hover:` instead of onMouseEnter/Leave
- Hamburger dropdown uses Tailwind classes for positioning and styling

- [ ] **Step 2: Verify desktop layout**

Open `http://localhost:5173` at full width. You should see:
- Light grey (#F8FAFC) page background
- "SmarterDog" logo with "Smarter" in dark, "Dog" in blue
- Pill nav group: Bookings | Dogs | Humans | Stats
- Hamburger menu on the right
- No bottom tab bar visible

- [ ] **Step 3: Verify mobile layout**

Resize browser to ~375px width (or use dev tools responsive mode). You should see:
- Slim top bar: just logo + hamburger
- Desktop nav tabs hidden
- Bottom tab bar fixed to viewport bottom: 4 tabs with icons + labels
- Active tab highlighted in blue
- Content has bottom padding so it doesn't hide behind the bar

- [ ] **Step 4: Verify hamburger menu works on both**

Click the hamburger icon on both desktop and mobile. Dropdown should appear with Reports, Settings, and Log out options. Clicking outside should close it.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppToolbar.jsx
git commit -m "feat: rewrite AppToolbar with Tailwind — desktop top bar + mobile bottom tabs"
```

---

### Task 4: Update theme-color Meta Tag

**Files:**
- Modify: `index.html`

The current theme-color is `#2563EB` (a dark blue from the old design). Update it to match the new light background.

- [ ] **Step 1: Update the theme-color**

In `index.html`, find:

```html
<meta name="theme-color" content="#2563EB" />
```

Replace with:

```html
<meta name="theme-color" content="#F8FAFC" />
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "chore: update theme-color meta to match new light background"
```

---

### Task 5: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

```bash
node node_modules/.bin/vite build
```

Expected: clean build, no errors. CSS output should include Tailwind utilities.

- [ ] **Step 2: Desktop walkthrough**

At 1300px width:
- Light grey background with centred content (wider than before — 1024px max instead of 900px)
- AppToolbar: logo + pill nav + hamburger, all Tailwind-styled
- All views (Bookings, Dogs, Humans, Stats) still render correctly with their inline styles
- Hamburger menu opens/closes
- No bottom tab bar visible

- [ ] **Step 3: Mobile walkthrough**

At 375px width:
- Top bar: just logo + hamburger
- Bottom tab bar: 4 tabs with icons, labels. Active in blue.
- Can navigate between all views using bottom tabs
- Content doesn't hide behind bottom bar
- Hamburger works for Reports/Settings/Logout

- [ ] **Step 4: Tablet walkthrough**

At 768px width:
- Desktop layout should show (md breakpoint)
- All nav tabs visible in top bar
- No bottom tab bar

- [ ] **Step 5: Commit any fixes**

If any issues found, fix and commit with descriptive message.
