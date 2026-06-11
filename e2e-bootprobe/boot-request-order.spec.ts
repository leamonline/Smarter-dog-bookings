import { test, expect } from "@playwright/test";

// Boot-waterfall regression guard.
//
// The app boots ONLINE against https://stub.supabase.test (see
// playwright.bootprobe.config.ts). A fake session is seeded under
// supabase-js's storage key BEFORE any page script runs, so getSession()
// resolves locally without a network round trip; the staff_profiles read is
// then delayed ~400ms so the probe can observe what else the app fires
// while the auth gate's spinner is up.
//
// Asserts:
//   1. The three tier-1 reads (bookings week, salon_config, day_settings
//      week) are ISSUED before the staff_profiles response resolves — i.e.
//      they run concurrently with the profile fetch, not after it.
//   2. The two directory page-0 RPCs (search_dogs_directory /
//      search_humans_directory) stay off the boot path: none before first
//      paint, none within the first ~1s; they only appear once the idle
//      warmup (~2.5s) lands.

const STUB_ORIGIN = "https://stub.supabase.test";

// src/supabase/client.js does not set auth.storageKey, so supabase-js
// derives the default: `sb-${first DNS label of the project URL}-auth-token`.
const STORAGE_KEY = "sb-stub-auth-token";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// An unsigned JWT-shaped access token with a future exp. supabase-js only
// inspects the stored session locally (expires_at + shape checks) — the
// signature is never verified client-side.
function makeFakeSession() {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + 60 * 60;
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "bootprobe@example.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const access_token = [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({
      iss: `${STUB_ORIGIN}/auth/v1`,
      sub: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      exp,
      iat: nowSec,
      session_id: "11111111-1111-4111-8111-111111111111",
    }),
    "bootprobe-unsigned-signature",
  ].join(".");
  return {
    access_token,
    token_type: "bearer",
    expires_in: exp - nowSec,
    expires_at: exp,
    refresh_token: "bootprobe-refresh-token",
    user,
  };
}

const STAFF_PROFILE_DELAY_MS = 400;

test("tier-1 queries fire during the profile fetch; directory page-0 stays off the boot path", async ({
  page,
}) => {
  const session = makeFakeSession();

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify(session) },
  );

  const requests: { url: string; at: number }[] = [];
  let staffProfilesFirstResolvedAt: number | null = null;

  await page.route(`${STUB_ORIGIN}/**`, async (route) => {
    const url = route.request().url();
    requests.push({ url, at: Date.now() });

    // Auth endpoints: getSession() resolves from storage so these are not
    // expected pre-render, but autoRefresh may fire later — answer with a
    // valid session/user JSON reusing the fake tokens either way.
    if (url.includes("/auth/v1/user")) {
      await route.fulfill({ json: session.user });
      return;
    }
    if (url.includes("/auth/v1/")) {
      await route.fulfill({ json: session });
      return;
    }

    // The auth gate's profile read — delayed so the probe can watch what
    // is (and is not) issued while the gate's spinner is up.
    if (url.includes("/rest/v1/staff_profiles")) {
      await new Promise((resolve) => setTimeout(resolve, STAFF_PROFILE_DELAY_MS));
      if (staffProfilesFirstResolvedAt === null) {
        staffProfilesFirstResolvedAt = Date.now();
      }
      // .single() expects a bare object.
      await route.fulfill({
        contentType: "application/vnd.pgrst.object+json",
        json: {
          id: "9aab6a40-0000-4000-8000-000000000010",
          user_id: USER_ID,
          role: "owner",
          display_name: "Boot Probe",
        },
      });
      return;
    }

    if (url.includes("/rest/v1/bookings")) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.includes("/rest/v1/day_settings")) {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.includes("/rest/v1/salon_config")) {
      // .maybeSingle() on a GET accepts an array and unwraps row 0.
      await route.fulfill({
        json: [
          {
            id: "9aab6a40-0000-4000-8000-000000000020",
            default_pickup_offset: 2,
            pricing: null,
            enforce_capacity: false,
            large_dog_slots: null,
            settings: null,
          },
        ],
      });
      return;
    }
    if (url.includes("/rest/v1/rpc/")) {
      // Directory and other RPCs — empty result set shape.
      await route.fulfill({ json: { rows: [], total: 0, letters: [] } });
      return;
    }
    // Anything else (realtime handshakes over http, etc.).
    await route.fulfill({ json: [] });
  });

  const navStartedAt = Date.now();
  await page.goto("/");

  // First paint of the staff shell: the toolbar's "New booking" button is
  // the stable landmark for the calendar shell (same anchor as the smoke
  // suite) — it renders only after the auth gate has cleared.
  await page
    .getByRole("button", { name: /new booking/i })
    .first()
    .waitFor({ timeout: 15_000 });
  const firstPaintAt = Date.now();

  const firstRequestFor = (fragment: string) =>
    requests.find((r) => r.url.includes(fragment));

  // Diagnostic timeline (relative ms from navigation start) — printed so a
  // regression failure shows the actual boot order at a glance.
  const timeline = () =>
    requests
      .map(
        (r) =>
          `  +${String(r.at - navStartedAt).padStart(5)}ms  ${r.url
            .replace(STUB_ORIGIN, "")
            }`,
      )
      .join("\n");
  console.log(
    `boot request order (staff_profiles resolved at +${
      (staffProfilesFirstResolvedAt ?? 0) - navStartedAt
    }ms; first paint at +${firstPaintAt - navStartedAt}ms):\n${timeline()}`,
  );

  // ── 1. Tier-1 queries issued BEFORE the profile read resolved ──
  expect(staffProfilesFirstResolvedAt, "staff_profiles was fetched").not.toBeNull();
  for (const fragment of [
    "/rest/v1/bookings",
    "/rest/v1/salon_config",
    "/rest/v1/day_settings",
  ]) {
    const req = firstRequestFor(fragment);
    expect(req, `${fragment} was requested during boot`).toBeTruthy();
    expect(
      req!.at,
      `${fragment} must be issued before the staff_profiles response resolves`,
    ).toBeLessThan(staffProfilesFirstResolvedAt!);
  }

  // ── 2. Directory page-0 RPCs stay off the boot path ──
  const searchRequests = () =>
    requests.filter(
      (r) =>
        r.url.includes("search_dogs_directory") ||
        r.url.includes("search_humans_directory"),
    );

  // None before first paint…
  expect(
    searchRequests().filter((r) => r.at <= firstPaintAt),
    "no directory page-0 RPC before first paint",
  ).toEqual([]);

  // …and none within the first ~1s of the boot.
  await page.waitForTimeout(Math.max(0, navStartedAt + 1000 - Date.now()));
  expect(
    searchRequests().filter((r) => r.at - navStartedAt < 1000),
    "no directory page-0 RPC within the first second",
  ).toEqual([]);

  // They DO arrive after the ~2.5s idle warmup (deferred, not dropped).
  await expect
    .poll(() => searchRequests().length, {
      message: "directory page-0 RPCs fire after the idle warmup",
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(2);
});
