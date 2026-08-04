# Staff-only size dropdown in the dog card edit modal

**Date:** 2026-05-19
**Status:** Approved for implementation

## Problem

`DogCardModal` (the staff-facing modal for editing an existing dog) lets staff
change name, breed, DOB, owner, notes, alerts and custom price — but not size.
Size is auto-derived from breed (`getSizeForBreed`) at create time, but:

- Mixed/cross breeds don't auto-derive and so end up with `size = null`.
- An auto-derived size can be wrong for a particular dog (e.g. an undersized
  Standard Poodle).
- Legacy rows may have `null` size with no UI path to fix them.

The modal already flags `!resolvedDog.size` as `incomplete` (DogCardModal.jsx
line 454) but offers no way to clear that flag.

## Scope

In:

- Add a size selector to `DogCardModal` while in edit mode.
- Match the breed-auto-fill + manual-override pattern already used in
  `AddDogModal` so behaviour is consistent across the two staff modals.

Out:

- No data-model changes — `dog.size` already exists as
  `"small" | "medium" | "large" | null` and `useDogs.update` already accepts
  `updates.size`.
- No changes to `AddDogModal` (already has this control).
- No changes to customer-facing flows (`AddDogInline`, `BookingWizard`,
  `DogsSection`). Customers still see the auto-derived size read-only;
  overriding is staff-only by virtue of which modal exposes the control.
- No coupling beyond what `AddDogModal` already does — the dropdown is not
  wired to any other system.

## Design

### Behaviour

- The dropdown's real, selectable options are exactly three:
  **Small**, **Medium**, **Large**. No "unset" / null option — staff
  explicitly picked this over allowing a clear-back-to-nothing flow.
- A non-selectable placeholder `<option value="">Select size</option>`
  exists *only* as the initial display state when the dog currently has
  `size = null` (legacy rows). Once staff pick S/M/L they cannot return
  to this placeholder. This mirrors `AddDogModal`'s pattern.
- When staff change the breed in the modal header, `getSizeForBreed(newBreed)`
  runs. If it returns a value *and* staff have not manually overridden the
  size in this edit session, the dropdown updates to match. This mirrors
  `AddDogModal`'s `sizeAutoSet` / `sizeOverridden` pattern.
- Once staff manually pick a size from the dropdown, subsequent breed changes
  in the same edit session leave the size alone.
- On Save: if the selected size differs from `resolvedDog.size`, include
  `size` in the `onUpdateDog` updates payload. Otherwise, omit it.
- On Cancel: reset size and the auto/overridden flags to the values that
  matched `resolvedDog.size` on enter-edit.
- A small "auto" badge appears next to the Size label when
  `sizeAutoSet && !sizeOverridden`, matching `AddDogModal`'s green cue.

### Files touched

1. `src/components/modals/DogCardModal.jsx`
   - New state: `editSize`, `sizeAutoSet`, `sizeOverridden`.
   - Wrap `setEditBreed` so breed changes also derive a size when applicable
     and not overridden.
   - Re-sync `editSize` and the flags in the existing
     `useEffect([resolvedDog])` block.
   - Reset in `handleCancel`.
   - Include `editSize` in `handleSave`'s `updates` when it differs from
     `resolvedDog.size`.
   - Pass `editSize`, `setEditSize` (wrapped to set `sizeOverridden`),
     `sizeAutoSet`, `sizeOverridden` down to `DogDetailsSection`.

2. `src/components/modals/dog-card/DogDetailsSection.jsx`
   - New props: `editSize`, `setEditSize`, `sizeAutoSet`, `sizeOverridden`.
   - In the edit-mode `<SectionCard title="Dog Details">`, insert a "Size"
     row between Owner and Groom Notes.
   - Native `<select>` styled with the existing `INPUT_CLS`.
   - Tiny "auto" badge near the label when the size was just set by the
     breed handler and not yet overridden.

### Files not touched

- `src/components/modals/AddDogModal.jsx` — already has the same dropdown
  and pattern; nothing to do.
- `src/components/modals/dog-card/DogCardHeader.jsx` — the `BreedCombobox`
  callback shape stays the same; the change is in the wrapping setter that
  `DogCardModal` passes down.
- `src/supabase/hooks/useDogs.ts` — `update` already maps
  `updates.size → dbUpdates.size` (line 376).
- `src/types/index.ts` and `src/constants/breeds.ts` — no schema or
  constants changes needed.

## Why this is staff-only

- `DogCardModal` is not imported by `CustomerApp.jsx`. The customer side
  uses `AddDogInline` and `DogsSection`, neither of which exposes size
  editing. So "staff only" is enforced by which app surface the modal
  lives on, not by an in-component role check. No new auth gate is
  required for this change.

## Risks and considerations

- Sequence in `handleSave`: the size update must be applied alongside the
  other field changes in a single `onUpdateDog` call so the existing
  optimistic-update behaviour still works.
- If staff are editing a dog with `size = null` and don't touch the
  dropdown, the dropdown should not coerce a value. The save handler
  therefore guards on `editSize !== resolvedDog.size` to avoid stamping
  an arbitrary default onto a legacy null row.
- The "auto" badge state is local to the edit session. Cancel/Save both
  reset it back to its enter-edit value.

## Acceptance

- A dog with a wrong size can be corrected by a staff member through the
  modal, and the new size persists across a page reload.
- A dog whose breed is changed to a known breed gets an auto-suggested
  size, which staff can override by picking from the dropdown.
- A dog with `null` size whose owner-staff opens edit mode but doesn't
  touch size sees no change to the size on save.
- The customer-facing dog flows are unchanged.
