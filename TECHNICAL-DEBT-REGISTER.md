# Technical Debt Register

Inheriting this codebase on Monday. 25 entries, no fixes yet. Evidence cited
as `file:line`. Cost rubric: **S** = hours, **M** = a few days, **L** = a
sustained workstream (week+).

## Mixed paradigms & weak typing

| What hurts | Why it hurts | Cost |
|---|---|---|
| **1. JS-first codebase with TypeScript bolted on the side.** 189 non-test `.js/.jsx` files vs 36 `.ts/.tsx`. `tsconfig.json` sets `allowJs: true, checkJs: false`. | JS files get zero type checking. A rename in `src/types/index.ts` (e.g. `Booking.staffCapacityOverride`) is only enforced inside the TS slice — JS callers in `useBookings.js`, `BookingDetailModal.jsx`, etc. break silently. The `Booking` type itself is imported by ~15 TS files but the source-of-truth shape is the DB row. | L |
| **2. TS escape hatches concentrated in critical paths.** 59 `: any` / `as any` usages across 11 files (`BookingWizard.tsx:168,222,500,550`, `useReportsData.ts:154,264,268,305,504,509`, `useBookingEditState.ts:51,77`, `useSlotAvailability.ts:41-60`, `useModalState.ts:26-27`). | The reports pipeline, customer booking flow, and slot availability — all business-critical — are TypeScript in name only. `dogs={dogs as any}` is passed into typed children, defeating the wrapper. | M |
| **3. ESLint safety rules disabled.** `eslint.config.js:51-66` turns off `@typescript-eslint/no-unused-vars`, `no-explicit-any`, `react-hooks/exhaustive-deps`, `no-unused-vars`, and allows empty catch blocks. | Stale `useEffect` dependency arrays land without warning (and there are dozens — see App.jsx:234 missing `setSelectedDogId`/`setSelectedHumanId`). Dead variables accumulate. No automated pressure to add types. | S |
| **4. `.js` import extension used for `.ts`/`.tsx` modules.** `App.jsx:12-25` imports `./supabase/client.js`, `./engine/utils.js`, `./hooks/useBookingActions.js` — all of which are `.ts`. `CustomerApp.jsx:6` imports `./BookingWizard.js` when the file is `.tsx`. | Hides what is and isn't typed. New devs cannot tell from a grep which modules ship types. The bundler resolves these because `moduleResolution: "bundler"`, but the deception is corrosive. | S |

## God files

| What hurts | Why it hurts | Cost |
|---|---|---|
| **5. `src/supabase/hooks/useHumans.ts` — 1050 LoC, single export.** 8 `useState` + 2 `useEffect` + 9 `useCallback`. Mixes pagination, realtime channels on `humans` + `dog_trusted_humans`, debounced search, full CRUD, phone/constraint validation, bidirectional trusted-contact linking, value sanitization, optimistic updates. | One bug in (say) the realtime resync corrupts the search cache. The pagination + ID-based ensure logic is what App.jsx:364-399 has to compensate for at the call site — leaky pagination. | L |
| **6. `src/supabase/hooks/useWhatsAppInbox.js` — 1042 LoC, single export.** 14+ `useState`, 3 realtime channels, draft approval/rejection, booking-action application, AI mode selection, auto-send toggling, manual SMS/template sending, derived `attachedActions` memo. | The WhatsApp surface is the most user-visible AI feature; every change risks regressing draft submission or message ordering. No test file (`useWhatsAppInbox.test.js` covers only `filterAttachedActions`). | L |
| **7. `src/components/modals/HumanCardModal.jsx` — 972 LoC.** 21+ `useState`, nested `HumanBookingHistory` and `DogPill` components, server-side trusted search with debounce, booking history rendering, reminder preferences, dog-relationship display, form editing + validation. | This and DogCardModal are the customer-facing "profile" surfaces. Any change touches all the modals at once because the file mixes display, edit, and search modes behind one component. | L |
| **8. `src/components/modals/DogCardModal.jsx` — 755 LoC, 34 hooks.** 19+ `useState` for edit state, 3 `useEffect` (on-demand fetch, re-sync defaults, server-side owner search), 5 `useCallback`. Hosts chain booking modal nested, photo gallery, owner linking with search, delete confirmation. | Same shape as Human modal — neither was extracted. Photo gallery + chain booking flows force-mount even when the user just wants to view a dog. | L |
| **9. `src/components/modals/BookingDetailModal.jsx` — 811 LoC.** Internally renders DatePickerModal, RecurringBookingModal, RescheduleModal, PhotoUploadModal, OverrideAuditFooter. 5 nested useMemo + autosave + exit confirmation. | Opening a booking detail eagerly loads the dependency graph for 4 sibling modals. Editing logic lives both here and in `useBookingEditState.ts`, but the boundary is fuzzy (props bridge state in both directions). | M |
| **10. `src/components/views/inbox/InboxView.jsx` — 708 LoC.** Destructures 20+ values from `useWhatsAppInbox`, plus its own 6 hooks. Switches between 6 list modes (`all/unread/drafts/bookings/needs_review/done`), thread detail, draft panel, booking action panel, compose box, manual reply, mobile/desktop layout, deep-linking from URL. | Conversation routing logic is tangled with rendering logic. Adding a 7th list mode is a multi-file ripple even though it's conceptually one filter. | L |
| **11. `src/App.jsx` — 757 LoC, 5 data hooks + 4 effect hooks at the top level.** Coordinates auth, routing, modal state across 10 modals, offline fallback, rebook flow, profile URL-to-modal mapping, plus 3 effects that compensate for `useHumans`/`useDogs` pagination (lines 364-399). | App.jsx is the place every story starts. New routes mean adding props to `WeekCalendarView` (31 props now, line 596-633) or `HumansView`/`DogsView` which each get 12+ identical props in two route variants. | M |

## Leaky abstractions

| What hurts | Why it hurts | Cost |
|---|---|---|
| **12. Direct Supabase client used inside 12+ components.** `components/customer/booking/BookingWizard.tsx`, `BookingCard.jsx`, `CustomerDashboard.jsx`, `auth/LoginPage.jsx`, `auth/ResetPasswordPage.jsx`, `dashboard/TomorrowRemindersCard.jsx`, `views/settings/AccountSettings.jsx`, `views/settings/CalendarSettings.jsx`, `views/inbox/compose-new/ComposeNewModal.jsx`, etc. all call `.from().select()` / `.rpc()` / `auth.*` inline. | Two implicit data layers exist: the `src/supabase/hooks/` layer (for staff) and ad-hoc inline queries (mostly customer surface). RLS bugs in customer queries can't be caught by tests because the queries are constructed in JSX. | L |
| **13. Snake_case DB columns leak into customer components.** `BookingWizard.tsx:217` selects `"id, slot, size, service, status, addons, payment, confirmed, dog_id, pickup_by_id, booking_date"`; line 281 updates `{status: "Cancelled", cancel_reason: ...}`; line 313 inserts `{human_id, target_date}`. `src/supabase/transforms.ts` exists for exactly this conversion but is bypassed on the customer side. | A Postgres column rename breaks the customer portal without breaking any hook test. Field names appear in 2-3 cases (camel + snake) inside one component, increasing typo risk. | M |
| **14. `useDogs.ts` maintains two parallel dog maps.** `dogsById` (UUID-keyed) and `dogs` (name-keyed). Every mutation updates both (lines 113-114, 122-123, 138-148, 198-199, 235-236, 320-321). | Drift between the maps silently corrupts UI — e.g. a rename keeps a stale entry under the old name. There's no invariant check or single source of truth; the dual shape is a workaround for downstream callers that grew up indexing by name. | M |
| **15. Pricing stored as a display string and re-parsed in four places.** `constants/salon.ts:40-44` uses `"£42+"` (NBSP, "+"). `engine/pricing.js:11`, `hooks/useReportsData.ts:47`, `components/views/reports/WeeklySnapshot.jsx:11`, `customer/booking/BookingWizard.tsx:469` each call `parseFloat(...replace(/[^0-9.]/g, ""))`. | Currency, "starting from" semantics, locale, and tax all silently disappear when reports treat "£42+" as `42`. Custom prices override at booking time but reporting ignores that path inconsistently. | M |
| **16. Realtime channel names are global string literals.** `useTodos.js:34` (`"salon-todos"`), `useWaitlist.js:48` (`"waitlist_changes"`), `useWhatsAppSummary.js:190/214`, `useWhatsAppInbox.js:221`, etc. Some include `Date.now()`, most don't. | Mounting two instances of the same hook in dev (HMR, double-render) can collide on shared channels. The pattern is inconsistent — `useHumans.ts:173` and `useMonthBookings.js:63` use random suffixes, others don't. | S |
| **17. `sessionStorage` accessed directly in `src/lib/chunkReload.js`** (lines 25, 31, 51). Only call site, but no wrapper means future storage adds will copy this pattern. | Privacy-mode failures handled inline (`// sessionStorage can throw in privacy modes`); next developer reinventing the same workaround is likely. | S |

## Magic numbers / strings

| What hurts | Why it hurts | Cost |
|---|---|---|
| **18. Booking status strings scattered as raw literals.** `BOOKING_STATUSES` is defined in `constants/salon.ts:67-73`, but components write `"Booked"`, `"Cancelled"`, `"Checked in"` directly — 65 occurrences across `BookingCard.jsx:55`, `DogCardModal.jsx:712`, `CustomerDashboard.jsx:187,194`, `BookingActions.jsx:115,118`, `BookingDetailModal.jsx:332`, etc. The `BookingStatusId` type union in `types/index.ts:14-20` covers the canonical set but doesn't include "Cancelled" which is referenced as a status everywhere. | Renaming a status is a 65-call sweep with no compiler help (most call sites are JS). A typo like `"Booked "` (trailing space) would not be caught. | M |
| **19. Dog size strings have no runtime constant.** `DogSize = "small" \| "medium" \| "large"` exists in `types/index.ts:5` but there's no `DOG_SIZES` array. `engine/capacity.ts:9` hardcodes `size === "large"`; `useReportsData.ts:120` defaults to `"small"`. Iteration over sizes (rendering pricing rows etc.) is done by hand. | Adding a 4th size (e.g. "giant") would require finding every literal. Currently impossible to iterate generically. | S |
| **20. Salon phone number hardcoded four times in three formats.** `tel:07507731487` (`CustomerApp.jsx:109`, `CustomerDashboard.jsx:410`), `tel:+447507731487` (`CustomerUnavailablePage.jsx:22`), `wa.me/447507731487` (`CustomerApp.jsx:101`, `CustomerUnavailablePage.jsx:28`), display `"07507 731487"`. | The salon moving numbers means a hunt + replace across 3 files and 3 formatting conventions. Not in `src/constants/`. | S |
| **21. RPC names embedded as string literals throughout app code.** 8 distinct functions called from components and hooks: `apply_whatsapp_booking_action`, `link_customer_to_human`, `get_or_create_calendar_feed_token` (with feed_type "customer" / "staff"), `revoke_calendar_feed_token`, `mark_whatsapp_conversation_read`, `add_customer_trusted_human`, `update_customer_dog`. No central registry. | Renaming a Postgres function (which migrations do periodically — see the 85 migrations in `supabase/migrations/`) requires a grep. Some calls also embed parameter shape inline. | S |

## Inconsistent error handling

| What hurts | Why it hurts | Cost |
|---|---|---|
| **22. ~80 `console.error` calls in production code paths, only 1 dev-gated.** `useWhatsAppInbox.js` alone has 15+ (lines 206, 264, 394, 475, 514, 554, 594, 628, 646, 664, 694, 720, 780, 832, 856). `transforms.ts:364` is the lone `if (import.meta.env?.DEV) console.warn(...)`. | Sentry only catches `ErrorBoundary` render errors (`ErrorBoundary.jsx:24`); async hook failures land in the browser console and silently disappear in prod. Customer support has no trail. | M |
| **23. Errors set in state but not surfaced via toast.** `useBookings.js:210` calls `setError(message)` then `onErrorRef.current?.(message)` but `App.jsx:464` only renders the dataError banner if not dismissed. `DogCardModal.jsx:329-348`, `HumanCardModal.jsx:377` only `console.error`. Meanwhile `WaitlistModal.jsx:56`, `AddHumanModal.jsx:99`, `BookingDetailModal` use `toast.show("...", "error")`. Two parallel UX patterns mid-app. | The user sometimes gets a toast, sometimes a top-of-page banner, sometimes nothing. Hard to predict; QA-pass discoverable only by trying every error path. | M |
| **24. Catch-variable style inconsistent.** 36 instances of `catch (err)` vs 4 of `catch (e)` (`AccountSettings.jsx:40`, `ComposeNewModal.jsx:208,263,427`). One `.then()` without `.catch()` in `ComposeNewModal.jsx:228` (unhandled promise rejection on `fetchDogsForHuman`). | Trivial individually, but signals the absence of a lint rule. The unhandled `.then()` is the actual risk — silently fails. | S |

## Missing tests around critical paths

| What hurts | Why it hurts | Cost |
|---|---|---|
| **25. Zero tests for the four heaviest data hooks + the WhatsApp agent.** `useBookings.js` (496 LoC), `useDogs.ts` (765), `useHumans.ts` (1050), `useCustomerAuth.js` (323), `useAuth.js` — none have a `.test.*` file. `supabase/functions/whatsapp-agent/index.ts` (2045 LoC, the AI receptionist) — entire `supabase/functions/` directory has no tests. The OTP login flow (`CustomerLoginPage.jsx` 316 LoC) and drag-and-drop reschedule (`useSlotDragAndDrop.ts`) are also untested. Strong tests do exist for pure engine logic (`engine/capacity.test.js` 838 LoC, `engine/bookingRules.test.ts` 428 LoC). | The capacity engine — the part that's never wrong — is the most-tested. The orchestration layer that breaks when DB columns drift, AI prompts change, or auth flows shift, is the least-tested. Any backend refactor lands blind. | L |

## Proposed solutions

Numbered to match the register. Each is one concrete next move, not a
finished design — pick the ones that line up with your roadmap.

### Mixed paradigms & weak typing

1. **JS → TS, one hot file at a time.** Flip `tsconfig.json` to
   `checkJs: true, noImplicitAny: true` to surface the blast radius, then
   convert leaves first: `engine/pricing.js`, `data/sample.js`, then the
   data hooks (`useBookings`, `useAuth`). Target `App.jsx` last because
   it's the most-edited. Don't try a big-bang migration — keep PRs to ≤3
   files. Allow `allowJs: true` to stay during the journey.
2. **Generate DB row types and replace `any` at the hot spots.** Use
   `mcp__supabase__generate_typescript_types` to produce
   `Database['public']['Tables']['bookings']['Row']`, etc. Replace
   `(row: any)` in `BookingWizard.tsx`, `useReportsData.ts`,
   `useBookingEditState.ts` with the generated types. Turn on
   `@typescript-eslint/no-explicit-any` at `warn` after the cleanup.
3. **Re-enable ESLint rules incrementally.** Turn `react-hooks/exhaustive-deps`
   to `warn` first; sweep `App.jsx`, `useBookings.js`, modals to fix the
   loudest 20; promote to `error`. Same pattern for `no-unused-vars` and
   `no-empty` (drop `allowEmptyCatch`). Add CI gate after the sweep so
   no new violations land.
4. **Codemod the `.js` import extensions off TS files.** A short script
   (e.g. `jscodeshift` or just `grep | sed`) drops the extension where
   the resolved file is `.ts`/`.tsx`. Vite already resolves extensionless
   imports. Add an ESLint rule (`import/extensions: ["error", "never"]`)
   to keep them off.

### God files

5. **`useHumans.ts` → 3 hooks.** Split into `useHumansData` (paginate +
   realtime + add/update/delete), `useHumansSearch` (debounced search,
   own cache), `useTrustedContacts` (bidirectional linking). Each hook
   gets its own test file. App.jsx call site contracts to a single
   `useHumansData()` for the directory.
6. **`useWhatsAppInbox.js` → 4 hooks + a slice.** `useInboxList`,
   `useInboxThread(id)`, `useInboxComposer`, `useInboxBookingActions`,
   bound together by a thin reducer in `useWhatsAppInbox` for shared
   state (selection, mode). Realtime channels move into each hook.
7. **`HumanCardModal` → orchestrator + leaves.** Extract `HumanForm`
   (edit fields + validation), `HumanBookingHistorySection`,
   `TrustedContactsEditor`, `DogPillList`. Modal becomes a layout shell
   that renders the right leaf based on mode.
8. **`DogCardModal` → same pattern.** Extract `DogForm`,
   `DogPhotoGallery`, `OwnerLinkEditor`. Move the chain-booking flow to
   a sibling modal opened by callback so it doesn't pre-mount.
9. **`BookingDetailModal` nested modals → portal-rendered siblings.**
   Hoist DatePickerModal/RecurringBookingModal/RescheduleModal/
   PhotoUploadModal out of the render tree; render them via portal from
   App-level state or a `useModalStack()` hook. Lazy-load each.
10. **`InboxView` modes → one component per mode.** Replace the
    if/else cascade with `{ all: <InboxAll/>, drafts: <InboxDrafts/>, ... }[mode]`.
    Each mode component takes only the data it needs. Move mode into
    URL (`?mode=drafts`) so deep-links stop relying on local state.
11. **`WeekCalendarView` 31 props → context.** A `<SalonProvider>` is
    already wrapping app routes elsewhere — register the bookings,
    dogs, humans, handlers there and consume via hooks
    (`useBookingsForDate(dateStr)`, `useHandlers()`). Keep only the 3-4
    truly local props (`selectedDay`, `setSelectedDay`, layout switch).

### Leaky abstractions

12. **Repository layer for customer surface.** Add
    `src/supabase/repositories/bookingsRepo.ts`,
    `dogsRepo.ts`, `humansRepo.ts` exposing intent-named methods
    (`cancel(id, reason)`, `getMyDogs(humanId)`). All customer
    components route through these. Lint rule:
    `no-restricted-imports` blocks `supabase/client` from
    `components/customer/**`.
13. **Route customer queries through `transforms.ts`.** Snake_case
    columns disappear from `BookingWizard.tsx` once the repo above wraps
    the conversion. Combine with item 12 — same PR.
14. **Pick one dog map shape.** Keep `dogsById` (UUID-keyed) as the
    truth. Replace `dogs[name]` callsites with `selectDogByName(dogs, name)`
    selector (one-line lookup). Migrate consumers over a few PRs, then
    delete the `dogs` state and `setDogs` everywhere — net code
    reduction in `useDogs.ts`.
15. **Re-shape `PRICING` to a structured value.** `{ amount: 42, fromPrice: true, currency: 'GBP' }`.
    Add `formatPrice(p)` for display. The 4 regex-parse sites
    (`engine/pricing.js`, `useReportsData.ts`, `WeeklySnapshot.jsx`,
    `BookingWizard.tsx:469`) become `p.amount` reads. Reports get
    accurate "from-price" handling for free.
16. **Helper for realtime channel names.** `makeChannelName('humans')`
    returns `'humans-<uuid>'`. Update all 15 callsites. Removes the
    HMR double-subscription class of bug.
17. **Wrap storage once.** `src/lib/storage.ts` exports
    `safeGet/safeSet/safeRemove` that swallow the privacy-mode throw.
    Update `chunkReload.js`. Add `no-restricted-globals` lint rule
    against direct `sessionStorage`/`localStorage` use.

### Magic numbers / strings

18. **Status as a frozen const + derived type.**
    ```ts
    export const BOOKING_STATUSES = ['Booked', 'Checked in', 'In bath',
      'Ready for pick-up', 'Completed', 'Cancelled'] as const;
    export type BookingStatus = typeof BOOKING_STATUSES[number];
    ```
    Codemod the 65 literals (jscodeshift or grep+sed) to import the
    const. Add lint rule banning bare status strings in `components/**`.
19. **Add `DOG_SIZES` runtime constant.** `['small', 'medium', 'large'] as const`;
    derive the `DogSize` type from it. Update the ~10 callsites that
    hardcode `"large"` or iterate sizes by hand.
20. **Centralize salon contact info.** New `src/constants/salon-contact.ts`
    exports `SALON_PHONE_E164`, `SALON_PHONE_NATIONAL`,
    `SALON_PHONE_DISPLAY`, `SALON_WHATSAPP_URL`. Replace the 4 callsites
    across `CustomerApp.jsx`, `CustomerDashboard.jsx`,
    `CustomerUnavailablePage.jsx`.
21. **Typed RPC wrappers.** `src/supabase/rpc.ts` exports typed
    functions:
    ```ts
    export const applyWhatsappBookingAction = (params: {...}) =>
      supabase.rpc('apply_whatsapp_booking_action', params);
    ```
    Replace 8 inline RPC names. Argument shape becomes compile-checked.
    Re-generate when migrations rename functions.

### Inconsistent error handling

22. **Replace `console.error` with a `logger` module.** `src/lib/logger.ts`
    gates by `import.meta.env.DEV`, forwards to Sentry in prod with
    `tags: { hook: 'useWhatsAppInbox', op: 'sendReply' }`. Codemod the
    ~80 callsites. Pair with item 23.
23. **One error-UX pattern.** Document the rule: "If the user just did
    a thing → toast. If background data failed to load → banner.
    Always Sentry." Codemod the 20-ish `console.error` + `setError`
    patterns to also call `toast.show(msg, "error")`. Add an
    `useErrorHandler()` hook so future call sites do both in one line.
24. **Lint + fix the catch + then issues.** Add a custom ESLint rule (or
    use `unicorn/catch-error-name: ['error', { name: 'err' }]`) to
    enforce `catch (err)`. Codemod the 4 outliers. Fix the unhandled
    `.then()` in `ComposeNewModal.jsx:228` with `.catch(err => ...)`.

### Missing tests

25. **Spike on `useBookings.test.js` to set the pattern, then sweep.**
    Mock `supabase` via `vi.mock('../client')` returning a stub object.
    Test happy paths (add/update/remove/optimistic rollback) and the
    realtime path. ~150-line test file per hook. For
    `whatsapp-agent/index.ts`, set up `deno test` in
    `supabase/functions/whatsapp-agent/__tests__/`; pure helpers first,
    then the dispatch loop with stubbed Supabase/OpenAI clients. Add
    Playwright coverage for the OTP login + drag-and-drop in `e2e/`.
