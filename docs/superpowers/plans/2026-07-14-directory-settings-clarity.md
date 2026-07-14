# Directory and Settings Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove invalid nested interactions from directory cards and replace the nine equal-weight mobile Settings tabs with grouped navigation.

**Architecture:** Directory cards become semantic articles containing separate links and a single explicit profile button; no parent click handler remains. Settings keeps the existing desktop tab pattern and dirty-state guard, while mobile gets a two-level category/section navigator backed by the same `activeTab` and `requestTab` state.

**Tech Stack:** React, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Preserve Grid/List modes, filtering, sorting, A–Z rails, archived actions, alerts, contact links, and visible dog/owner information.
- Use the explicit label `View profile` on directory cards.
- Telephone, email, WhatsApp, unarchive, and add-dog actions remain independent controls.
- Keep desktop Settings tabs and arrow-key behaviour unchanged at `md` and above.
- Mobile category labels are `Salon`, `Bookings`, `Tools & connections`, and `Account`.
- The unsaved-changes confirmation must apply equally to desktop and mobile section changes.

---

### Task 1: Convert Humans directory cards to semantic articles

**Files:**
- Modify: `src/components/views/HumansView.jsx:150-300`
- Test: `src/components/views/HumansView.component.test.jsx`

**Interfaces:**
- Consumes: unchanged `onOpenHuman(id)`.
- Produces: one `button[name="View profile for {name}"]` per article.

- [ ] **Step 1: Replace whole-card interaction expectations**

Update order assertions to query profile buttons and add a nested-control guard:

```jsx
it("renders articles with explicit profile and contact actions", () => {
  const { onOpenHuman } = renderView({ directoryHumans: [sarah] });
  const article = screen.getByRole("article", { name: "Sarah Jones" });
  const profile = within(article).getByRole("button", { name: "View profile for Sarah Jones" });
  const phone = within(article).getByRole("link", { name: "07700900111" });

  fireEvent.click(phone);
  expect(onOpenHuman).not.toHaveBeenCalled();
  fireEvent.click(profile);
  expect(onOpenHuman).toHaveBeenCalledWith("h1");
});
```

Change the server-order test to assert the accessible names of the two `article` elements. Import `within` from Testing Library.

- [ ] **Step 2: Run the Humans test and verify it fails**

Run: `npm test -- src/components/views/HumansView.component.test.jsx`

Expected: FAIL because each card is currently a parent `role="button"`.

- [ ] **Step 3: Replace the parent button semantics**

For each list/grid opening tag, replace the parent interactive props with:

```jsx
<article
  aria-label={titleCase(fullName)}
  className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden shadow-card-resting hover:border-brand-purple hover:shadow-card-hover min-h-[112px] flex flex-col"
>
```

Immediately before the matching closing `</article>`, add:

```jsx
  <button
    type="button"
    onClick={open}
    className="mt-auto self-start min-h-[40px] px-3 py-2 rounded-full bg-brand-purple/10 text-brand-purple text-xs font-bold hover:bg-brand-purple/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
    aria-label={`View profile for ${titleCase(fullName)}`}
  >
    View profile
  </button>
</article>
```

Remove `role="button"`, `tabIndex`, parent `onClick`, `onKeyDown`, `cursor-pointer`, and every `stopPropagation` used only to protect nested links. Keep `stopPropagation` only where an archived action sits in another independently interactive wrapper.

- [ ] **Step 4: Run Humans tests**

Run: `npm test -- src/components/views/HumansView.component.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit Humans card semantics**

```bash
git add src/components/views/HumansView.jsx src/components/views/HumansView.component.test.jsx
git commit -m "fix: separate human card actions"
```

### Task 2: Convert Dogs directory cards to semantic articles

**Files:**
- Modify: `src/components/views/DogsView.jsx:110-310`
- Test: `src/components/views/DogsView.component.test.jsx`

**Interfaces:**
- Consumes: unchanged `onOpenDog(id)`.
- Produces: one `button[name="View profile for {dog}"]` per article.

- [ ] **Step 1: Write the Dogs article/action test**

```jsx
it("renders articles with independent owner contacts and a profile action", () => {
  const { onOpenDog } = renderView({ directoryDogs: [rex] });
  const article = screen.getByRole("article", { name: "Rex" });
  const profile = within(article).getByRole("button", { name: "View profile for Rex" });
  const phone = within(article).getByRole("link", { name: "07700900111" });

  fireEvent.click(phone);
  expect(onOpenDog).not.toHaveBeenCalled();
  fireEvent.click(profile);
  expect(onOpenDog).toHaveBeenCalledWith("d1");
});
```

Update server-order, Grid/List, and archived tests to query articles and explicit profile buttons instead of whole-card buttons.

- [ ] **Step 2: Run the Dogs test and verify it fails**

Run: `npm test -- src/components/views/DogsView.component.test.jsx`

Expected: FAIL because the card is still a parent button.

- [ ] **Step 3: Apply the same article structure**

For each list/grid opening tag, use `article[aria-label={dog name}]`, retain the existing visual content and contact links, and remove parent `role`, `tabIndex`, keyboard, and click handlers. Immediately before the matching closing `</article>`, add:

```jsx
<button
  type="button"
  onClick={open}
  className="mt-auto self-start min-h-[40px] px-3 py-2 rounded-full bg-brand-cyan/10 text-brand-cyan-text text-xs font-bold hover:bg-brand-cyan/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
  aria-label={`View profile for ${titleCase(dog.name)}`}
>
  View profile
</button>
```

Use the same action in List mode at the trailing edge. Do not move or hide the safety alert badge.

- [ ] **Step 4: Run both directory suites**

Run: `npm test -- src/components/views/HumansView.component.test.jsx src/components/views/DogsView.component.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit Dogs card semantics**

```bash
git add src/components/views/DogsView.jsx src/components/views/DogsView.component.test.jsx
git commit -m "fix: separate dog card actions"
```

### Task 3: Define grouped Settings metadata and mobile navigation

**Files:**
- Modify: `src/components/views/SettingsView.jsx:1-150`
- Test: `src/components/views/SettingsView.component.test.jsx`

**Interfaces:**
- Produces: `SETTING_GROUPS`, `mobileGroup`, and a responsive `isMobile` branch.
- Consumes: unchanged `requestTab(id)` dirty-state guard.

- [ ] **Step 1: Add mobile `matchMedia` control to tests**

In the test file, install a deterministic mobile media-query mock:

```jsx
function setViewportMobile(mobile) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: mobile && query === "(max-width: 767px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
```

Add:

```jsx
it("groups mobile settings and uses the existing dirty-state guard", async () => {
  setViewportMobile(true);
  const user = userEvent.setup();
  render(<SettingsView {...baseProps()} />);

  expect(screen.getByRole("navigation", { name: "Settings categories" })).toBeInTheDocument();
  await user.type(screen.getByDisplayValue("My Salon"), "!");
  await user.click(screen.getByRole("button", { name: "Bookings" }));
  await user.click(screen.getByRole("button", { name: "Booking Rules" }));
  expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the Settings suite and verify it fails**

Run: `npm test -- src/components/views/SettingsView.component.test.jsx`

Expected: FAIL because grouped mobile navigation does not exist.

- [ ] **Step 3: Add grouped metadata**

Replace the flat constant with groups and derive the flat desktop list:

```jsx
const SETTING_GROUPS = [
  { id: "salon", label: "Salon", sections: [
    { id: "business", label: "Your Business" },
    { id: "hours", label: "Hours & Closures" },
    { id: "pricing", label: "Services & Pricing" },
  ] },
  { id: "bookings", label: "Bookings", sections: [
    { id: "rules", label: "Booking Rules" },
    { id: "capacity", label: "Capacity Engine" },
  ] },
  { id: "connections", label: "Tools & connections", sections: [
    { id: "portal", label: "Customer Portal" },
    { id: "notifs", label: "Notifications" },
    { id: "calendar", label: "Calendar Sync" },
  ] },
  { id: "account", label: "Account", sections: [
    { id: "account", label: "Your Account" },
  ] },
];

const SECTIONS = SETTING_GROUPS.flatMap((group) => group.sections);
```

Add state:

```jsx
const isMobile = useMediaQuery("(max-width: 767px)");
const [mobileGroup, setMobileGroup] = useState("salon");
const activeMobileSections = SETTING_GROUPS.find((group) => group.id === mobileGroup)?.sections ?? [];
```

Import `useMediaQuery` from `../../hooks/useMediaQuery`.

- [ ] **Step 4: Render mobile groups and retain desktop tabs**

Replace the single always-rendered tablist with an `isMobile` branch. The mobile branch is:

```jsx
<nav aria-label="Settings categories" className="mb-5 space-y-3">
  <div className="grid grid-cols-2 gap-2">
    {SETTING_GROUPS.map((group) => (
      <button
        key={group.id}
        type="button"
        aria-pressed={mobileGroup === group.id}
        onClick={() => setMobileGroup(group.id)}
        className={mobileGroup === group.id
          ? "min-h-[44px] rounded-lg bg-brand-purple text-white text-sm font-bold"
          : "min-h-[44px] rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-bold"}
      >
        {group.label}
      </button>
    ))}
  </div>
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 flex flex-col gap-1">
    {activeMobileSections.map((section) => (
      <button
        key={section.id}
        type="button"
        aria-current={activeTab === section.id ? "page" : undefined}
        onClick={() => requestTab(section.id)}
        className={activeTab === section.id
          ? "min-h-[44px] rounded-lg bg-white text-brand-teal text-left px-3 text-sm font-bold shadow-sm"
          : "min-h-[44px] rounded-lg bg-transparent text-slate-600 text-left px-3 text-sm font-semibold"}
      >
        {section.label}
      </button>
    ))}
  </div>
</nav>
```

The desktop branch is the existing `role="tablist"` block without responsive visibility classes. This ensures only one navigation model is present in the accessibility tree at a time.

When `confirmDiscard` changes the active tab, also set `mobileGroup` to the group containing `pendingTab`. When a clean `requestTab` succeeds, update `mobileGroup` to that section’s group so programmatic and desktop changes stay aligned.

- [ ] **Step 5: Preserve desktop keyboard semantics**

Keep the existing `role="tablist"`, roving `tabIndex`, and Left/Right/Home/End handler in the desktop branch. The flat `SECTIONS` derived from the groups preserves its current order. Update the content wrapper to use the active section as its mobile accessible name:

```jsx
<div
  role="tabpanel"
  id="settings-panel"
  aria-label={isMobile ? `${SECTIONS.find((section) => section.id === activeTab)?.label} settings` : undefined}
  aria-labelledby={isMobile ? undefined : `settings-tab-${activeTab}`}
  tabIndex={0}
  className="focus:outline-none"
>
```

- [ ] **Step 6: Run Settings tests**

Run: `npm test -- src/components/views/SettingsView.component.test.jsx src/components/views/settings`

Expected: PASS.

- [ ] **Step 7: Commit grouped Settings navigation**

```bash
git add src/components/views/SettingsView.jsx src/components/views/SettingsView.component.test.jsx
git commit -m "feat: group settings navigation on mobile"
```

### Task 4: Responsive and keyboard verification

**Files:**
- No source change expected.

- [ ] **Step 1: Inspect directories at all widths**

At 1440×900, 768×1024, and 390×844, confirm each article exposes visible View profile, telephone/WhatsApp links remain reachable, and tapping whitespace does not open a profile.

- [ ] **Step 2: Verify keyboard order**

Tab through one Human and one Dog article. Confirm focus reaches contact links and View profile once each, with no parent-card focus stop.

- [ ] **Step 3: Inspect Settings at all widths**

Confirm desktop retains the tab row; tablet and mobile show four categories plus only the selected category’s sections. Create an unsaved Business edit, attempt to enter Booking Rules, and verify Keep editing and Discard changes both behave correctly.
