# Directory Identity Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish Humans and Dogs directory cards with one compact identity-led hierarchy and a size-coloured Smarter Dog silhouette for dogs.

**Architecture:** Introduce two small presentation primitives for initials and dog silhouettes, backed by the existing brand/size tokens. Keep Humans and Dogs directory item logic local to each view so pagination, filtering, owner resolution and independent contact actions remain unchanged. Apply the same hierarchy to grid and list variants with responsive Tailwind classes.

**Tech Stack:** React 19, Tailwind CSS 4, existing `public/images/dog-silhouette.png`, existing `SIZE_THEME`/brand tokens, Vitest and Testing Library.

## Global Constraints

- Human markers use deterministic initials; dog markers use the existing Smarter Dog silhouette.
- Small is yellow, medium teal, large coral, and unknown/unconfirmed neutral grey, using existing tokens rather than duplicate hex values.
- Written size remains visible; colour is never the only size indicator.
- Keep search, sort, filters, A-Z navigation, pagination, archived records and profile modals unchanged.
- Telephone, email, WhatsApp, profile and unarchive controls remain independent.
- Direct actions retain at least 44px touch targets.
- Names have priority; truncate secondary details first on narrow screens.
- Do not add dog photo upload or modify Human/Dog profile modals.

---

### Task 1: Identity marker primitives

**Files:**
- Create: `src/components/views/directory/IdentityMarker.jsx`
- Create: `src/components/views/directory/IdentityMarker.component.test.jsx`

**Interfaces:**
- Produces: `HumanInitials({ fullName, className? })`, `DogSizeMark({ size, decorative?, className? })`, and `ProfileArrow({ label, onClick })`.
- `DogSizeMark` renders written accessibility as `aria-label="Small dog"` only when not explicitly decorative; expose a `decorative=true` prop for cards that already show written size.

- [ ] **Step 1: Write failing primitive tests**

```jsx
it.each([
  ["Mollie Bennett", "MB"],
  ["Prince", "P"],
  ["", "?"],
])("derives initials for %s", (name, initials) => {
  render(<HumanInitials fullName={name} />);
  expect(screen.getByTestId("human-initials")).toHaveTextContent(initials);
});

it.each([
  ["small", "small"],
  ["medium", "medium"],
  ["large", "large"],
  [null, "unknown"],
])("maps %s to the authoritative size tone", (size, tone) => {
  render(<DogSizeMark size={size} />);
  const mark = screen.getByLabelText(new RegExp(tone === "unknown" ? "size unknown" : `${tone} dog`, "i"));
  expect(mark).toHaveAttribute("data-size-tone", tone);
  expect(mark.querySelector("img")).toBeNull();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:component -- src/components/views/directory/IdentityMarker.component.test.jsx`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the markers with the silhouette as a CSS mask**

```jsx
const DOG_TONE = {
  small: "text-brand-purple bg-brand-yellow/30 border-brand-yellow-dark/50",
  medium: "text-brand-teal-dark bg-brand-teal/10 border-brand-teal/35",
  large: "text-brand-coral-dark bg-brand-coral-light border-brand-coral/35",
  unknown: "text-slate-500 bg-slate-100 border-slate-300",
};

export function HumanInitials({ fullName, className = "" }) {
  const initials = String(fullName || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  return <span data-testid="human-initials" aria-hidden="true" className={`grid size-13 shrink-0 place-items-center rounded-2xl bg-brand-purple/10 font-extrabold text-brand-purple ${className}`}>{initials}</span>;
}

export function DogSizeMark({ size, decorative = false, className = "" }) {
  const tone = ["small", "medium", "large"].includes(size) ? size : "unknown";
  const label = tone === "unknown" ? "Dog size unknown" : `${tone[0].toUpperCase()}${tone.slice(1)} dog`;
  return <span data-testid="dog-size-mark" data-size-tone={tone} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label} className={`grid size-13 shrink-0 place-items-center rounded-full border ${DOG_TONE[tone]} ${className}`}>
    <span aria-hidden="true" className="dog-size-mark__silhouette size-8" />
  </span>;
}

export function ProfileArrow({ label, onClick }) {
  return <button type="button" aria-label={label} onClick={onClick} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-brand-purple hover:bg-brand-purple/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark">›</button>;
}
```

Add this rule to `src/index.css`; do not rely on Tailwind parsing mask shorthand, convert the PNG, or duplicate the asset:

```css
.dog-size-mark__silhouette {
  background: currentColor;
  mask: url("/images/dog-silhouette.png") center / contain no-repeat;
  -webkit-mask: url("/images/dog-silhouette.png") center / contain no-repeat;
}
```

- [ ] **Step 4: Run tests, typecheck and commit**

Run: `npm run test:component -- src/components/views/directory/IdentityMarker.component.test.jsx && npm run typecheck`

Expected: PASS with no JSX/TypeScript errors.

```bash
git add src/components/views/directory/IdentityMarker.jsx src/components/views/directory/IdentityMarker.component.test.jsx src/index.css
git commit -m "feat(directory): add identity markers"
```

---

### Task 2: Identity-led Human cards

**Files:**
- Modify: `src/components/views/HumansView.jsx:149-290`
- Modify: `src/components/views/HumansView.component.test.jsx:46-220`

**Interfaces:**
- Consumes: `HumanInitials` and `ProfileArrow` from Task 1, existing `DogChips`, `telLink`, `waLink`, `SafetyAlertChip`, and `UnarchiveButton`.
- Produces local helpers `ContactLines({ human })` for independent telephone/email/WhatsApp anchors and `HumanDogs({ dogList, archived, onOpen })` for dog chips or the no-dog action.

- [ ] **Step 1: Add failing hierarchy and independence tests for grid and list**

```jsx
it.each(["Grid", "List"])("uses the identity-led %s card without merging contact actions", (mode) => {
  const { onOpenHuman } = renderView({
    directoryHumans: [{ ...sarah, email: "sarah@example.com" }],
    dogsByHumanId: { h1: [{ id: "d1", name: "Minnie", breed: "Shih Tzu", size: "small" }] },
  });
  if (mode === "List") fireEvent.click(screen.getByRole("button", { name: "List" }));
  const card = screen.getByRole("article", { name: "Sarah Jones" });
  expect(within(card).getByTestId("human-initials")).toHaveTextContent("SJ");
  expect(within(card).getByText(/Minnie/)).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "sarah@example.com" })).toHaveAttribute("href", "mailto:sarah@example.com");
  fireEvent.click(within(card).getByRole("button", { name: "View profile for Sarah Jones" }));
  expect(onOpenHuman).toHaveBeenCalledWith("h1");
});
```

Keep existing no-phone, no-dog, history-flag and archived-unarchive tests; add assertions that those states still render inside the new card.

- [ ] **Step 2: Run Human directory tests and confirm failure**

Run: `npm run test:component -- src/components/views/HumansView.component.test.jsx`

Expected: FAIL because no initials marker exists.

- [ ] **Step 3: Recompose `DirectoryItem` around marker/body/action columns**

```jsx
<article aria-label={titleCase(fullName)} className={mode === "list" ? listCardClass : gridCardClass}>
  <HumanInitials fullName={fullName} />
  <div className="min-w-0 flex-1">
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-title font-extrabold text-brand-purple">{titleCase(fullName)}</span>
      {human.historyFlag && <SafetyAlertChip items={[human.historyFlag]} className="shrink-0 max-w-[45%]" />}
    </div>
    <ContactLines human={human} />
    <HumanDogs dogList={humanDogs} archived={showArchived} onOpen={open} />
  </div>
  <ProfileArrow label={`View profile for ${titleCase(fullName)}`} onClick={open} />
  {showArchived && <UnarchiveButton inline onUnarchive={() => onUnarchive(human.id)} />}
</article>
```

Use local `ContactLines`, `HumanDogs`, and `ProfileArrow` helpers to avoid duplicating the grid/list branches. Preserve independent anchors and prevent the arrow button from wrapping the contact links.

- [ ] **Step 4: Run Human tests and commit**

Run: `npm run test:component -- src/components/views/HumansView.component.test.jsx`

Expected: PASS for server order, directory controls, both view modes, contact independence, flags, no-dog and archived states.

```bash
git add src/components/views/HumansView.jsx src/components/views/HumansView.component.test.jsx
git commit -m "feat(humans): polish identity-led directory cards"
```

---

### Task 3: Identity-led Dog cards with size silhouettes

**Files:**
- Modify: `src/components/views/DogsView.jsx:164-285`
- Modify: `src/components/views/DogsView.component.test.jsx:51-220`

**Interfaces:**
- Consumes: `DogSizeMark` and `ProfileArrow` from Task 1, `computeAge`, `resolveOwner`, `OwnerContact`, `SafetyAlertChip`, `Badge`, and `UnarchiveButton`.
- Produces local `OwnerLine({ owner, skeleton })`, preserving the existing skeleton, missing-owner text and independent contact anchors.

- [ ] **Step 1: Add failing size-tone and state-preservation tests**

```jsx
it.each([
  ["small", "small"],
  ["medium", "medium"],
  ["large", "large"],
  [null, "unknown"],
])("renders the %s silhouette with written size", (size, tone) => {
  renderView({ directoryDogs: [{ ...rex, size, name: `Dog ${tone}` }] });
  const card = screen.getByRole("article", { name: `Dog ${tone}` });
  expect(within(card).getByTestId("dog-size-mark")).toHaveAttribute("data-size-tone", tone);
  const written = tone === "unknown" ? "Size unknown" : `${size[0].toUpperCase()}${size.slice(1)}`;
  expect(within(card).getByText(written)).toBeInTheDocument();
});

it("keeps alert, incomplete, owner contact and profile actions independent", () => {
  const { onOpenDog } = renderView({ directoryDogs: [{ ...bella, size: null }] });
  const card = screen.getByRole("article", { name: "Bella" });
  expect(within(card).getByText("Incomplete")).toBeInTheDocument();
  expect(within(card).getByText("Nervous of clippers")).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "07700900112" })).toBeInTheDocument();
  fireEvent.click(within(card).getByRole("button", { name: "View profile for Bella" }));
  expect(onOpenDog).toHaveBeenCalledWith("d2");
});
```

Add `data-testid="dog-size-mark"` to the primitive to support these assertions without coupling tests to CSS internals.

- [ ] **Step 2: Run Dog directory tests and confirm failure**

Run: `npm run test:component -- src/components/views/DogsView.component.test.jsx`

Expected: FAIL because cards use `SizeDot` and omit written size.

- [ ] **Step 3: Recompose `DirectoryItem` with the silhouette and written size**

```jsx
<article aria-label={titleCase(dog.name)} className={mode === "list" ? listCardClass : gridCardClass}>
  <DogSizeMark size={dog.size} decorative />
  <div className="min-w-0 flex-1">
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-title font-extrabold text-brand-purple">{titleCase(dog.name)}</span>
      {incomplete && <Badge tone="warning" size="xs" uppercase>Incomplete</Badge>}
    </div>
    <p className="truncate text-body font-semibold text-slate-600">
      {titleCase(dog.breed) || "No breed"}{age ? ` · ${age}` : ""}
    </p>
    <p className="text-micro font-semibold text-ink-muted">
      {dog.size ? titleCase(dog.size) : "Size unknown"}
    </p>
    <OwnerLine owner={owner} skeleton={ownerSkeleton} />
    {dog.alerts?.length > 0 && <SafetyAlertChip items={dog.alerts} />}
  </div>
  <ProfileArrow label={`View profile for ${titleCase(dog.name)}`} onClick={open} />
  {showArchived && <UnarchiveButton inline onUnarchive={() => onUnarchive(dog.id)} />}
</article>
```

Keep owner skeleton behaviour and independent owner contact links. Remove the card-local decorative gradient strip and `SizeDot` only where the silhouette replaces them; retain `SizeDot` in filters/legends.

- [ ] **Step 4: Run Dog tests and commit**

Run: `npm run test:component -- src/components/views/DogsView.component.test.jsx`

Expected: PASS for every size, unknown/incomplete, alerts, owner states, grid/list, archive and directory controls.

```bash
git add src/components/views/directory/IdentityMarker.jsx src/components/views/DogsView.jsx src/components/views/DogsView.component.test.jsx
git commit -m "feat(dogs): add size-coloured identity cards"
```

---

### Task 4: Responsive directory verification

**Files:**
- Create: `e2e/directories.spec.ts`

**Interfaces:**
- Verifies the shared card hierarchy delivered by Tasks 1-3 without changing data contracts.

- [ ] **Step 1: Add a browser check for both directory routes**

```ts
test("identity cards remain balanced across directory breakpoints", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/humans");
    await expect(page.getByTestId("human-initials").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /View profile for/i }).first()).toBeVisible();
    await page.goto("/dogs");
    await expect(page.getByTestId("dog-size-mark").first()).toBeVisible();
    await expect(page.getByText(/Small|Medium|Large|Size unknown/).first()).toBeVisible();
  }
});
```

Run this file through the existing Playwright offline web server (`VITE_FORCE_OFFLINE=1`), matching the authentication-free directory smoke contract in `e2e/smoke.spec.ts`.

- [ ] **Step 2: Run focused component and browser checks**

Run: `npm run test:component -- src/components/views/directory/IdentityMarker.component.test.jsx src/components/views/HumansView.component.test.jsx src/components/views/DogsView.component.test.jsx && npx playwright test e2e/directories.spec.ts`

Expected: PASS in the configured `desktop`, `tablet`, and `mobile` Chromium projects.

- [ ] **Step 3: Run full verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`

Expected: all tests and static checks pass; the production build completes.

- [ ] **Step 4: Commit browser coverage**

```bash
git add e2e/directories.spec.ts
git commit -m "test(directory): cover identity cards at key widths"
```
