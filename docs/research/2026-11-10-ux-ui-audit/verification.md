# Audit verification

Status: Safe presentation slice verified; live audit remains blocked
Base: `aa0929bd`; observations: 10 November 2026; handoff: 11 November 2026

The report-first commit is `9d38c590`. Twelve individual finding commits follow
it. A separate read-only reviewer checked the source diff and identified the
existing `Template sent` UI assertion; that phrase was preserved while the
unconditional delivery promise was removed. No approved template body or
protected implementation path changed.

## Required checks

| Command | Result |
|---|---|
| `npm run lint` | Pass: 0 errors, 66 existing warnings |
| `npm run check:docs` | Pass; rerun after final documentation edits |
| `npm run typecheck` | Pass; final exit-status confirmation recorded separately |
| `npm run check:migrations` | Pass: 253 files |
| `npm run test` | Pass: 479 files, 5,344 tests |
| `npm run build` | Pass, including PWA asset generation |
| `npm run check:design-system` | Pass: 725 items within seven ratchets |
| `npm run website:lint` | Pass |
| `npm run website:test` | Pass: 38 files, 237 tests |
| `npm run website:build` | Pass: 15 marketing routes plus 404 prerendered |

The initial command sessions expired before handoff, but their complete logs
remain in `/workspace/audit-scratch/checks/`. Typechecking was reconfirmed to
retain its explicit exit status. No failed test or assertion was weakened.
Lint's existing icon check skipped its optional render proof because its
browser discovery did not recognise system Chromium; icon files were not
changed. The independent Playwright visual checks used `/usr/bin/chromium`.

## Visual and interaction checks

- Accepted before/after pairs for each changed visual/copy surface are in
  `/workspace/audit-scratch/before/` and `/workspace/audit-scratch/after/`.
  Baseline walk-in and template-success states were re-rendered from the
  immutable report-first source during this audit, then final source restored.
  Temporary component fixtures were removed before lint/test/build.
- 390px touch and 1440px fine-pointer comparisons cover welcome, template
  explanation/fields/outcome, cancellation fields, breed size guidance,
  reminder preview, commitment labels, selected-day copy, website booking
  controls, walk-in guidance and cookie wording.
- Template controls measure 44px on the coarse-pointer phone and 32px on the
  fine-pointer desktop. Commitment detail labels measure 12px at both widths.
  These checks do not assert every control elsewhere meets the target floor.
- The five standalone changed-component fixtures have no root horizontal
  overflow at 375, 390, 430 or 1440px. Dogs, Humans, Settings landing, Cash-up
  and Insights have no root horizontal overflow at 390/1440. Their screenshots
  were inspected; the report shows a supplementary contact sheet.
- Local phone arrival plus sample reply completed: six taps plus typing,
  10.6 seconds in one scripted run. This is not a human reading-time estimate.
- Local desktop two-dog creation completed with a browser-only same-owner
  fixture and Don't send selected: nine clicks plus search typing, 1.64 seconds
  in one scripted run. The stock sample contains only one dog per owner.
- Sample numeric booking IDs were normalised to strings in intercepted local
  module responses to exercise Booking details. This bypasses a sample-only
  mismatch, not a live UUID failure. Move booking completed through date,
  time and Confirm Move; Dog A disappeared from the original day, capacity
  changed from three to two, and Booking rescheduled appeared with Undo.
  A separate human move time was not measured.
- Live navigation failed with `ERR_TUNNEL_CONNECTION_FAILED`. The customer
  portal has no complete authenticated sample journey. No full customer
  completion time, live-volume verdict, provider outcome, installed-PWA
  behaviour or assistive-technology compliance is claimed.

Node is already v24.19.0 in this workspace; `fnm` is absent. Commands use the
installed Node 24 directly. Both dependency installs used `npm ci`.
The brief's `.claude/launch.json` is absent;
`npm run dev -- --port 5174 --strictPort` uses the documented sample-data launcher instead. The website
runs separately on port 5175. No live development command was used.

The public live website and login could not be reached from Chromium.
GitHub CLI issue reads were network-blocked; the connected GitHub reader
worked. Automatic approval review rejected creating a tracking issue, so no
issue exists for this audit. The user's explicitly requested draft PR remains
the intended handoff.

## Publication handoff

The verified branch is pushed to `origin/ux/ui-audit-2026-11`.
[Draft PR #1200](https://github.com/leamonline/Smarter-dog-bookings/pull/1200)
was opened on 11 November 2026 after explicit user confirmation of the
repository, head and target. The earlier automatic approval rejection is
resolved for PR creation. The optional tracking issue remains uncreated.
The PR stays draft; no merge or deployment is authorised. Live/full customer
verification remains blocked as described above.
