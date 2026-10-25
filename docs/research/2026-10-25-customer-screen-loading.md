# Customer screen loading measurements

Status: Implemented locally; release pending review
Issue: [#1073, slice 5](https://github.com/leamonline/Smarter-dog-bookings/issues/1073)
Base: `main@2eeb7ba3`
Measured: 25 October 2026

## Change and contract

`src/CustomerApp.jsx` previously imported every customer screen statically.
It now uses React `lazy` for the dashboard, booking wizard and five account
onboarding/gate screens. Sign-in stays eager. Existing authentication, profile
and signup gate ordering, route state and explicit booking confirmation remain
unchanged. A local Suspense boundary uses the existing `LoadingSpinner`;
`ErrorBoundary` also covers account gates, and retains stale-chunk recovery.
The existing entrance Suspense boundary in `src/index.jsx` is unchanged.
No prefetch is added: a customer downloads the selected screen when needed.
The trade-off is one additional chunk request on first opening each screen.

## Method and results

Both builds used the same lockfile, Node 24+ bundled runtime and
`VITE_FORCE_OFFLINE=1 npm run build -- --manifest`, with no credentials or
customer data. The baseline was built before source edits. From each Vite
manifest, recursively follow the CustomerApp entry's `imports`, deduplicate
chunks, exclude `dynamicImports`, and sum JavaScript file sizes. Gzip each file
individually with Node's default `gzipSync` for a comparable compressed estimate.
This graph includes common entrance/vendor dependencies; it is not just the
CustomerApp file.

| Customer entrance static JavaScript graph | Before | After |
| --- | ---: | ---: |
| Chunks | 42 | 8 |
| Uncompressed bytes | 534,126 | 319,131 |
| Sum of per-file gzip bytes | 177,841 | 105,600 |

Estimated compressed JavaScript falls by 72,241 bytes (40.6%). The manifest
now names all seven selected screens as dynamic imports. Shared dependencies
remain shared rather than being duplicated intentionally into route bundles.

For a local loading timing, serve both production outputs over localhost,
open a fresh Chromium browser context for each of five runs and dynamically
import the CustomerApp entry from a blank `/book/login` document. Block
non-local requests. Measure elapsed `performance.now()` until import resolves.
No customer auth hook is mounted by the benchmark; this measures module graph
fetch, parse and evaluation, not authenticated rendering or database latency.

| Cold module import | Before | After |
| --- | --- | --- |
| Five runs, milliseconds | 71, 52, 56, 70, 58 | 22, 21, 21, 22, 20 |
| Median, milliseconds | 58 | 21 |

These are local, unthrottled, credential-free measurements, not a production
speed promise. Supabase is tree-shaken from credential-free builds. Real
networks, device CPU, authentication and database timings are unmeasured.
Authenticated phone/tablet/desktop visual journeys and deployed performance
remain release verification limits; no live customer session was used.

## Regression evidence

`src/CustomerApp.loading.component.test.jsx` uses synthetic auth and mocked
screen modules. It proves sign-in imports none of the larger screens, the
onboarding gate wins over `/new`, and dashboard/booking load only when selected.
The test failed against eager imports before the change. Existing chunk reload
unit tests continue to cover the reload loop guard and failed-import recovery.
