import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { failSession, saveSession, type FlowSessionRow } from "./db.ts";

interface SessionRow extends FlowSessionRow {
  updated_at?: string;
}

/**
 * A deliberately small in-memory PostgREST table. It retains the actual
 * status write performed by failSession rather than replacing session IO with
 * a spy, so the terminal-state race remains observable.
 */
class SessionTable {
  constructor(readonly row: SessionRow) {}

  update(patch: Partial<SessionRow>) {
    return new SessionUpdate(this.row, patch);
  }
}

class SessionUpdate implements PromiseLike<{ error: null }> {
  private token: string | null = null;
  private expectedStatus: string | null = null;
  private excludedStatus: string | null = null;

  constructor(
    private readonly row: SessionRow,
    private readonly patch: Partial<SessionRow>,
  ) {}

  eq(column: string, value: string) {
    if (column === "flow_token") this.token = value;
    if (column === "status") this.expectedStatus = value;
    return this;
  }

  neq(column: string, value: string) {
    if (column === "status") this.excludedStatus = value;
    return this;
  }

  then<TResult1 = { error: null }, TResult2 = never>(
    onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const matches = this.token === this.row.flow_token &&
      (!this.expectedStatus || this.row.status === this.expectedStatus) &&
      (!this.excludedStatus || this.row.status !== this.excludedStatus);
    if (matches) Object.assign(this.row, this.patch);
    return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
  }
}

Deno.test("a stale failure write cannot overwrite a completed Flow session", async () => {
  const sessions = new SessionTable({
    flow_token: "flow-committed-before-memory-refresh",
    phone_e164: "+447700900001",
    human_id: "human-1",
    flow_type: "cancel_reschedule",
    screen: "SUCCESS",
    state: {},
    status: "completed",
    booking_id: "new-dog-a",
    expires_at: "2099-01-01T00:00:00.000Z",
  });
  const supabase = {
    from(table: string) {
      if (table !== "whatsapp_flow_sessions") throw new Error(`unexpected table ${table}`);
      return sessions;
    },
  } as unknown as SupabaseClient;

  await failSession(supabase, "flow-committed-before-memory-refresh");

  assertEquals(sessions.row.status, "completed");
  assertEquals(sessions.row.booking_id, "new-dog-a");
});

Deno.test("a stale save cannot overwrite a completed Flow session", async () => {
  const committedState = {
    flow_mode: "reschedule" as const,
    date: "2026-08-03",
    old_booking_ids: ["old-dog-a"],
  };
  const sessions = new SessionTable({
    flow_token: "flow-saved-after-commit",
    phone_e164: "+447700900002",
    human_id: "human-1",
    flow_type: "cancel_reschedule",
    screen: "SUCCESS",
    state: committedState,
    status: "completed",
    booking_id: "new-dog-a",
    expires_at: "2099-01-01T00:00:00.000Z",
  });
  const supabase = {
    from(table: string) {
      if (table !== "whatsapp_flow_sessions") throw new Error(`unexpected table ${table}`);
      return sessions;
    },
  } as unknown as SupabaseClient;

  await saveSession(supabase, "flow-saved-after-commit", {
    screen: "SELECT_DATE",
    state: { date: "2026-08-10" },
  });

  assertEquals(sessions.row.status, "completed");
  assertEquals(sessions.row.screen, "SUCCESS");
  assertEquals(sessions.row.state, committedState);
  assertEquals(sessions.row.booking_id, "new-dog-a");
});

Deno.test("an active Flow session still accepts a save", async () => {
  const sessions = new SessionTable({
    flow_token: "flow-still-active",
    phone_e164: "+447700900003",
    human_id: "human-1",
    flow_type: "cancel_reschedule",
    screen: "SELECT_DATE",
    state: {},
    status: "active",
    booking_id: null,
    expires_at: "2099-01-01T00:00:00.000Z",
  });
  const supabase = {
    from(table: string) {
      if (table !== "whatsapp_flow_sessions") throw new Error(`unexpected table ${table}`);
      return sessions;
    },
  } as unknown as SupabaseClient;

  await saveSession(supabase, "flow-still-active", {
    screen: "SELECT_SLOT",
    state: { date: "2026-08-10" },
  });

  assertEquals(sessions.row.status, "active");
  assertEquals(sessions.row.screen, "SELECT_SLOT");
  assertEquals(sessions.row.state, { date: "2026-08-10" });
  assertEquals(sessions.row.booking_id, null);
});
