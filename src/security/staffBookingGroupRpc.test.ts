import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260701230000_staff_booking_group_rpc.sql",
  "utf8",
);

describe("create_staff_booking_group RPC hardening", () => {
  it("is SECURITY INVOKER (adds atomicity, not privilege) with a pinned search_path", () => {
    // Staff already INSERT directly under RLS; the group RPC must run as the
    // caller so the staff INSERT policy and the three BEFORE-INSERT gates
    // apply exactly as on the direct insert. DEFINER here would be a new
    // RLS-bypassing surface — that regression is what this test pins.
    // Line-anchored: the header comments legitimately DISCUSS "security
    // definer"; only a definition line counts.
    expect(sql).toMatch(/^security invoker$/im);
    expect(sql).not.toMatch(/^\s*security definer\s*$/im);
    expect(sql).toMatch(/set search_path = public/i);
  });

  it("gates on is_staff() with a clean error", () => {
    expect(sql).toMatch(/if not public\.is_staff\(\)/i);
    expect(sql).toMatch(/42501/);
  });

  it("pre-acquires the trigger's per-slot advisory locks in sorted order", () => {
    // Same key expression as validate_booking_capacity — sorted so two
    // concurrent groups touching the same slots can't deadlock.
    expect(sql).toMatch(
      /hashtextextended\(p_booking_date::text \|\| '\|' \|\| v_lock_slot, 0\)/,
    );
    expect(sql).toMatch(/order by \(e->>'slot'\)/);
  });

  it("revokes anon and grants authenticated only (not service_role)", () => {
    // SECURITY INVOKER + is_staff() gate ⇒ a service_role call (no auth.uid())
    // fails the gate, so a service_role grant would be unreachable dead code.
    // Only the authenticated staff client can reach this RPC.
    expect(sql).toMatch(
      /revoke all on function public\.create_staff_booking_group.*from anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.create_staff_booking_group.*to authenticated/i,
    );
    expect(sql).not.toMatch(/to anon/i);
    expect(sql).not.toMatch(/to service_role/i);
  });

  it("does not assign a group_id (staff flow contract)", () => {
    // The staff flow has never grouped rows under a group_id; silently
    // starting to would change cancel/reschedule semantics.
    expect(sql).not.toMatch(/insert into public\.bookings[^;]*group_id/i);
  });
});
