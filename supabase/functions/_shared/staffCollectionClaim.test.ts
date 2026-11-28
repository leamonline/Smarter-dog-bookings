import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { withStaffCollectionClaim } from "./staffCollectionClaim.ts";

const input = {
  bookingId: "26800000-0000-4000-8000-000000000101",
  recipientId: "26800000-0000-4000-8000-000000000001",
  phone: "+447700900321",
  channel: "whatsapp" as const,
};
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });

function fixture() {
  type Claim = { state: string; recorded?: boolean; providerId?: string | null; attempt_id?: string };
  let claim: Claim | undefined;
  let unavailable = false;
  const db = {
    rpc(name: string, args: Record<string, unknown>) {
      if (unavailable) return Promise.resolve({ data: null, error: "unavailable" });
      if (name === "claim_staff_collection_notice") {
        if (claim && claim.state !== "not_sent") return Promise.resolve({ data: { ...claim }, error: null });
        claim = { state: "pending", attempt_id: crypto.randomUUID() };
        return Promise.resolve({ data: { ...claim, state: "claimed" }, error: null });
      }
      if (claim?.attempt_id !== args.p_attempt_id) return Promise.resolve({ data: false, error: null });
      claim = { ...claim, state: String(args.p_state), recorded: args.p_recorded === true, providerId: String(args.p_provider_id ?? "") };
      return Promise.resolve({ data: true, error: null });
    },
  } as unknown as SupabaseClient;
  return { db, claim: () => claim, setUnavailable: () => { unavailable = true; } };
}

Deno.test("provider acceptance survives an Inbox failure and replays on a different channel", async () => {
  const f = fixture();
  let attempts = 0;
  const first = await withStaffCollectionClaim(f.db, input, reply, async (accept) => {
    attempts++;
    await accept("mock-provider-id");
    throw new Error("Inbox unavailable");
  });
  assertEquals(first.status, 502);
  assertEquals(f.claim()?.state, "accepted");
  assertEquals(f.claim()?.providerId, "mock-provider-id");
  const second = await withStaffCollectionClaim(f.db, { ...input, channel: "sms" }, reply, () => {
    attempts++;
    throw new Error("replay should not call provider");
  });
  assertEquals(await second.json(), { ok: true, recorded: false, replayed: true });
  assertEquals(attempts, 1);
});

Deno.test("simultaneous attempt, uncertain delivery and database failure all fail closed", async () => {
  const f = fixture();
  let release!: () => void;
  let entered!: () => void;
  const sending = new Promise<void>((resolve) => { entered = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const first = withStaffCollectionClaim(f.db, input, reply, async () => {
    entered();
    await wait;
    throw new Error("provider response lost");
  });
  await sending;
  const unexpected = () => { throw new Error("must not call provider"); };
  const concurrent = await withStaffCollectionClaim(f.db, input, reply, unexpected);
  assertEquals((await concurrent.json()).outcome, "unknown");
  release();
  assertEquals((await (await first).json()).outcome, "unknown");
  assertEquals(f.claim()?.state, "unknown");
  assertEquals((await (await withStaffCollectionClaim(f.db, input, reply, unexpected)).json()).outcome, "unknown");
  f.setUnavailable();
  assertEquals((await withStaffCollectionClaim(f.db, input, reply, unexpected)).status, 503);
});

Deno.test("only a definite refusal permits another explicit attempt", async () => {
  const f = fixture();
  await withStaffCollectionClaim(f.db, input, reply, () =>
    Promise.resolve(reply({ ok: false, outcome: "not_sent" }, 502)));
  const oldAttempt = f.claim()?.attempt_id;
  assertEquals(f.claim()?.state, "not_sent");
  const accepted = await withStaffCollectionClaim(f.db, input, reply, async (accept) => {
    await accept("mock-accepted");
    return reply({ ok: true, recorded: true });
  });
  assertEquals(accepted.status, 200);
  assertEquals(f.claim()?.recorded, true);
  assertEquals(f.claim()?.attempt_id === oldAttempt, false);
});
