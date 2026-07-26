import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { failSession } from "./db.ts";

interface SessionRow {
  flow_token: string;
  status: "active" | "completed" | "failed";
  booking_id: string | null;
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
    status: "completed",
    booking_id: "new-dog-a",
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
