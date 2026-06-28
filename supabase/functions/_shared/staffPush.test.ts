// ============================================================
// Unit tests for the pure staff-push reconciliation logic.
//
// Runs under `deno test` (the function runtime), alongside the whatsapp-agent
// dispatch tests — see the agent-tests job in .github/workflows/ci.yml.
//
// Run locally:  deno test --node-modules-dir=none supabase/functions/_shared/staffPush.test.ts
// ============================================================
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  reconcilePushDeliveries,
  selectRecipients,
  type PushDeliveryResult,
  type StaffSubscriptionRow,
} from "./staffPush.ts";

const sub = (id: string, failure_count?: number | null): StaffSubscriptionRow => ({
  id,
  user_id: `u-${id}`,
  endpoint: `https://push.example/${id}`,
  p256dh: "key",
  auth: "auth",
  failure_count,
});
const r = (s: StaffSubscriptionRow, res: PushDeliveryResult["res"]): PushDeliveryResult => ({ sub: s, res });

Deno.test("delivered subs are counted, reset, and never pruned", () => {
  const out = reconcilePushDeliveries([r(sub("a", 3), { success: true })], 5);
  assertEquals(out.sent, 1);
  assertEquals(out.failed, 0);
  assertEquals(out.usedIds, ["a"]);
  assertEquals(out.deadIds, []);
  assertEquals(out.bumps, []);
});

Deno.test("gone (410/404) subs are pruned immediately, regardless of count", () => {
  const out = reconcilePushDeliveries([r(sub("a", 0), { gone: true })], 5);
  assertEquals(out.failed, 1);
  assertEquals(out.deadIds, ["a"]);
  assertEquals(out.bumps, []);
});

Deno.test("a soft failure bumps failure_count by one, grouped by the new value", () => {
  const out = reconcilePushDeliveries(
    [
      r(sub("a", undefined), null), // first failure → 1
      r(sub("b", 2), null), // → 3
      r(sub("c", null), { success: false }), // first failure → 1
    ],
    5,
  );
  assertEquals(out.failed, 3);
  assertEquals(out.deadIds, []);
  // a and c both land on count 1; b on 3.
  const byCount = Object.fromEntries(out.bumps.map((b) => [b.failureCount, b.ids.slice().sort()]));
  assertEquals(byCount, { 1: ["a", "c"], 3: ["b"] });
});

Deno.test("a soft failure that REACHES the threshold prunes the device", () => {
  // failure_count 4, threshold 5 → next is 5 → prune (not bump).
  const out = reconcilePushDeliveries([r(sub("a", 4), null)], 5);
  assertEquals(out.deadIds, ["a"]);
  assertEquals(out.bumps, []);
});

Deno.test("a soft failure one below the threshold still bumps, not prunes", () => {
  // failure_count 3, threshold 5 → next is 4 → bump, keep.
  const out = reconcilePushDeliveries([r(sub("a", 3), null)], 5);
  assertEquals(out.deadIds, []);
  assertEquals(out.bumps, [{ failureCount: 4, ids: ["a"] }]);
});

Deno.test("mixed batch splits cleanly across reset / prune / bump", () => {
  const out = reconcilePushDeliveries(
    [
      r(sub("ok", 2), { success: true }),
      r(sub("dead", 0), { gone: true }),
      r(sub("soft", 1), null),
      r(sub("limit", 4), null),
    ],
    5,
  );
  assertEquals(out.sent, 1);
  assertEquals(out.failed, 3);
  assertEquals(out.usedIds, ["ok"]);
  assert(out.deadIds.includes("dead"));
  assert(out.deadIds.includes("limit"));
  assertEquals(out.deadIds.length, 2);
  assertEquals(out.bumps, [{ failureCount: 2, ids: ["soft"] }]);
});

// Guard the field added for this change: selectRecipients still passes the
// whole row (now incl. failure_count) straight through, so reconcile can read it.
Deno.test("selectRecipients preserves failure_count on the returned rows", () => {
  const picked = selectRecipients([sub("a", 3)], new Map(), "message", null);
  assertEquals(picked.length, 1);
  assertEquals(picked[0].failure_count, 3);
});
