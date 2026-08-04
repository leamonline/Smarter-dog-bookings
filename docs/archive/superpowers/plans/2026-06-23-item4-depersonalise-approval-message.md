# Item 4 — De-personalise the approval message — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded owner name in the large-dog rejection reason
(`"Large dogs need Leam's approval for this slot"`) with the person-independent
`"Needs manager approval for this slot"`, with no behaviour change.

**Architecture:** The reason string appears in three code spots that must stay identical: the
frontend engine's `CAPACITY_REASONS` set and its `canBookSlot()` return (`src/engine/capacity.ts`),
and the Deno behavioural mirror (`supabase/functions/_shared/capacity.ts`). `isCapacityRejection()`
membership-tests the set, so the set entry and the return value must match byte-for-byte. A stale
comment in the inbox preview component is updated for tidiness.

**Tech Stack:** TypeScript, Vitest (logic project, node env).

## Global Constraints

- UK English in all copy.
- The new string is exactly `Needs manager approval for this slot` (used verbatim in all three code
  spots and the test).
- `needsApproval: true` on the `canBookSlot()` return is unchanged.
- The frontend `CAPACITY_REASONS` set entry and the `canBookSlot()` return value MUST be the same
  string literal, or `isCapacityRejection()` stops recognising it as an overridable capacity reason.
- Behaviour-preserving: only the reason text changes; no control flow, no flags, no allocations.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Replace the hardcoded name across the engine + mirror

**Files:**
- Modify: `src/engine/capacity.ts:232` (the `CAPACITY_REASONS` set entry)
- Modify: `src/engine/capacity.ts:304` (the `canBookSlot()` return `reason`)
- Modify: `supabase/functions/_shared/capacity.ts:325` (the Deno mirror's `canBookSlot()` return)
- Modify: `src/components/views/inbox/thread/BookingCapacityPreview.jsx:7` (stale comment only)
- Test: `src/engine/capacity.test.js` (add an exact-contract assertion)

**Interfaces:**
- Consumes: `canBookSlot(bookings, slot, size, activeSlots, options?)` and the `SLOTS` constant,
  both already present in `src/engine/capacity.test.js`.
- Produces: nothing new — the public contract is the new reason string
  `"Needs manager approval for this slot"` returned for a large dog in a mid-morning slot with no
  staff approval override.

- [ ] **Step 1: Write the failing test**

Add this block to `src/engine/capacity.test.js` (after the existing
`describe("Mid-Morning Block ...")` block — it reuses the file's existing `canBookSlot`/`SLOTS`):

```javascript
describe("Approval message is person-independent (item 4)", () => {
  it("rejects a mid-morning large dog with a generic manager-approval reason", () => {
    const result = canBookSlot([], "10:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.needsApproval).toBe(true);
    expect(result.reason).toBe("Needs manager approval for this slot");
  });

  it("classifies the new approval reason as an overridable capacity rejection", () => {
    expect(isCapacityRejection("Needs manager approval for this slot")).toBe(true);
    expect(isCapacityRejection("Large dogs need Leam's approval for this slot")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/capacity.test.js -t "person-independent"`
Expected: FAIL — `reason` is still `"Large dogs need Leam's approval for this slot"`, and
`isCapacityRejection("Needs manager approval for this slot")` returns `false` (not yet in the set).

- [ ] **Step 3: Update the frontend engine — the `CAPACITY_REASONS` set entry**

In `src/engine/capacity.ts`, line 232, change:

```typescript
  "Large dogs need Leam's approval for this slot",
```
to:
```typescript
  "Needs manager approval for this slot",
```

- [ ] **Step 4: Update the frontend engine — the `canBookSlot()` return**

In `src/engine/capacity.ts`, line 304, change:

```typescript
          reason: "Large dogs need Leam's approval for this slot",
```
to:
```typescript
          reason: "Needs manager approval for this slot",
```

- [ ] **Step 5: Update the Deno mirror**

In `supabase/functions/_shared/capacity.ts`, line 325, change:

```typescript
          reason: "Large dogs need Leam's approval for this slot",
```
to:
```typescript
          reason: "Needs manager approval for this slot",
```

- [ ] **Step 6: Update the stale comment in the inbox preview**

In `src/components/views/inbox/thread/BookingCapacityPreview.jsx`, line 7, change:

```javascript
// or "Won't fit — large dogs need Leam's approval for this slot."
```
to:
```javascript
// or "Won't fit — needs manager approval for this slot."
```

- [ ] **Step 7: Run the new test to verify it passes**

Run: `npx vitest run src/engine/capacity.test.js -t "person-independent"`
Expected: PASS (both assertions).

- [ ] **Step 8: Run the full capacity + parity suites to confirm no regression**

Run: `npx vitest run src/engine/capacity.test.js src/lib/whatsapp/capacityParity.test.ts`
Expected: PASS. (Parity compares `findGroupedSlots` allocations only — reason text doesn't affect it,
so the mirror stays in agreement.)

- [ ] **Step 9: Confirm the name is gone from the engine paths**

Run: `grep -rn "Leam's approval" src/engine supabase/functions/_shared src/components/views/inbox`
Expected: no matches.

- [ ] **Step 10: Run lint + the logic suite (the CI gates this change touches)**

Run: `npm run lint && npm run test:logic`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/engine/capacity.ts supabase/functions/_shared/capacity.ts \
  src/components/views/inbox/thread/BookingCapacityPreview.jsx src/engine/capacity.test.js
git commit -m "$(cat <<'EOF'
refactor(capacity): de-personalise the large-dog approval message

Replace "Large dogs need Leam's approval for this slot" with the
person-independent "Needs manager approval for this slot" in the frontend
engine (CAPACITY_REASONS + canBookSlot return) and the Deno mirror. Copy-only;
needsApproval and isCapacityRejection behaviour unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** Item 4 of the spec (de-personalise the approval message; exact-string contract
  test) — covered by Task 1, Steps 1/7 (exact `toBe` assertion) and Steps 3–6 (all three code spots
  + comment).
- **Placeholder scan:** none — every step shows the exact before/after literal and command.
- **Type consistency:** uses the existing `canBookSlot`, `isCapacityRejection`, and `SLOTS` already
  imported in `src/engine/capacity.test.js`; the new string literal is identical in all four edits.
- **Note for later:** when item 5 makes `_shared/capacity.ts` a generated file, this manual mirror
  edit (Step 5) becomes generator output — the value still originates from the same source string.
