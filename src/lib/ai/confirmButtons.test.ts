// ============================================================
// src/lib/ai/confirmButtons.test.ts
//
// Behaviour tests for the confirm_buttons orchestrator that lives
// in supabase/functions/_shared/confirmButtons.ts. Same import-
// across-runtime pattern as agentRisk.test.ts.
//
// What this covers:
//   - Body-validation rejections (400)
//   - Pre-flight state checks (404 / 422 / 409)
//   - Conversation lookup (404, no-phone 422)
//   - Happy path: state transitions to awaiting_customer_confirm
//     with the Meta message id and a 24h expiry
//   - Meta failure surfaces 502 and leaves the row at 'pending'
//   - Concurrent retry race: two concurrent calls must result in
//     exactly ONE Meta send and ONE 409 (regression test for
//     handleConfirmButtons against the duplicate-button-message
//     symptom flagged by code review on commit 02df9bd)
// ============================================================

import { describe, it, expect, vi } from "vitest";

import {
  CONFIRM_BUTTON_TTL_MS,
  type ConfirmButtonsBody,
  type ConfirmButtonsDeps,
  type ConfirmButtonsMetaResult,
  type SupabaseLike,
  type SupabaseSelectQuery,
  type SupabaseTable,
  type SupabaseUpdateQuery,
  buildConfirmButtonsMetaBody,
  runConfirmButtons,
  validateConfirmButtonsBody,
  yesLabelFor,
} from "../../../supabase/functions/_shared/confirmButtons";

// ── Tiny in-memory supabase fake ─────────────────────────────
//
// Only implements the methods runConfirmButtons actually calls:
//   from(table).select(cols).eq(col, val).single()
//   from(table).update(values).eq(col, val).eq(col, val).select()
//
// Concurrency model: every chained call returns a Promise that
// resolves on the microtask queue, so two `await`-driven callers
// progress in lockstep at each yield boundary — the same way the
// real Supabase client behaves under PostgREST.

type Row = Record<string, unknown>;

interface FakeDB {
  tables: Record<string, Row[]>;
}

function makeFake(initial: Record<string, Row[]>): {
  supabase: SupabaseLike;
  db: FakeDB;
} {
  const db: FakeDB = {
    tables: Object.fromEntries(
      Object.entries(initial).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]),
    ),
  };

  const supabase: SupabaseLike = {
    from(tableName: string): SupabaseTable {
      const rows = db.tables[tableName];
      if (!rows) throw new Error(`unknown table: ${tableName}`);

      return {
        select(_cols?: string): SupabaseSelectQuery {
          const filters: Array<[string, unknown]> = [];
          const chain: SupabaseSelectQuery = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return chain;
            },
            single() {
              return Promise.resolve().then(() => {
                const matches = rows.filter((r) =>
                  filters.every(([c, v]) => r[c] === v),
                );
                if (matches.length === 0) {
                  return { data: null, error: { message: "no rows" } };
                }
                return { data: matches[0], error: null };
              });
            },
          };
          return chain;
        },
        update(values: Record<string, unknown>): SupabaseUpdateQuery {
          const filters: Array<[string, unknown]> = [];
          const chain: SupabaseUpdateQuery = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return chain;
            },
            select(_cols?: string) {
              return Promise.resolve().then(() => {
                const matches = rows.filter((r) =>
                  filters.every(([c, v]) => r[c] === v),
                );
                for (const m of matches) Object.assign(m, values);
                return { data: matches.map((m) => ({ id: m.id })), error: null };
              });
            },
          };
          return chain;
        },
      };
    },
  };

  return { supabase, db };
}

function freshBody(overrides: Partial<ConfirmButtonsBody> = {}): ConfirmButtonsBody {
  return {
    conversation_id: "conv-1",
    booking_action_id: "act-1",
    summary_text: "Book Bella for full-groom on Wed 13 May, 09:00. Confirm?",
    action_kind: "book",
    ...overrides,
  };
}

function freshDeps(
  supabase: SupabaseLike,
  metaMessageId: string | null = "wamid.HBgL",
  metaImpl?: () => Promise<ConfirmButtonsMetaResult>,
): ConfirmButtonsDeps & { callMeta: ReturnType<typeof vi.fn> } {
  const callMeta = vi.fn<(body: unknown) => Promise<ConfirmButtonsMetaResult>>(
    metaImpl ??
      (() =>
        Promise.resolve(
          metaMessageId === null
            ? { messages: [] }
            : { messages: [{ id: metaMessageId }] },
        )),
  );
  const recordOutbound = vi.fn(() => Promise.resolve());
  return {
    supabase,
    callMeta,
    recordOutbound,
    now: () => new Date("2026-05-12T07:00:00Z"),
  };
}

function freshTables(): Record<string, Row[]> {
  return {
    whatsapp_booking_actions: [
      {
        id: "act-1",
        conversation_id: "conv-1",
        state: "pending",
        customer_confirm_message_id: null,
        customer_confirm_expires_at: null,
      },
    ],
    whatsapp_conversations: [
      { id: "conv-1", phone_e164: "+447700900000" },
    ],
  };
}

// ── Body validation ──────────────────────────────────────────

describe("validateConfirmButtonsBody", () => {
  it("rejects missing conversation_id", () => {
    const v = validateConfirmButtonsBody(freshBody({ conversation_id: "" }));
    expect(v).toEqual({ ok: false, status: 400, reason: "conversation_id is required" });
  });
  it("rejects missing booking_action_id", () => {
    const v = validateConfirmButtonsBody(freshBody({ booking_action_id: "" }));
    expect(v).toEqual({
      ok: false,
      status: 400,
      reason: "booking_action_id is required",
    });
  });
  it("rejects missing summary_text", () => {
    const v = validateConfirmButtonsBody(freshBody({ summary_text: "" }));
    expect(v).toEqual({ ok: false, status: 400, reason: "summary_text is required" });
  });
  it("rejects unknown action_kind", () => {
    const v = validateConfirmButtonsBody(
      freshBody({ action_kind: "noop" as unknown as ConfirmButtonsBody["action_kind"] }),
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.status).toBe(400);
  });
  it("accepts a well-formed body", () => {
    expect(validateConfirmButtonsBody(freshBody())).toEqual({ ok: true });
  });
});

// ── Pure helpers ─────────────────────────────────────────────

describe("yesLabelFor", () => {
  it.each([
    ["book", "Yes, book it"],
    ["reschedule", "Yes, move it"],
    ["cancel", "Yes, cancel"],
  ] as const)("returns the %s label", (kind, expected) => {
    expect(yesLabelFor(kind)).toBe(expected);
  });
});

describe("buildConfirmButtonsMetaBody", () => {
  it("produces a Meta-shaped interactive button payload", () => {
    const body = buildConfirmButtonsMetaBody({
      toDigits: "447700900000",
      summaryText: "Book Bella for full-groom on Wed 13 May, 09:00. Confirm?",
      bookingActionId: "act-1",
      actionKind: "book",
    }) as Record<string, unknown>;
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("447700900000");
    expect(body.type).toBe("interactive");
    const interactive = body.interactive as Record<string, unknown>;
    expect(interactive.type).toBe("button");
    const action = interactive.action as { buttons: Array<Record<string, unknown>> };
    expect(action.buttons).toHaveLength(2);
    expect((action.buttons[0].reply as { id: string }).id).toBe("act-1:yes");
    expect((action.buttons[1].reply as { id: string }).id).toBe("act-1:no");
  });
  it("truncates oversize titles and summary text", () => {
    const longSummary = "x".repeat(2000);
    const body = buildConfirmButtonsMetaBody({
      toDigits: "447700900000",
      summaryText: longSummary,
      bookingActionId: "act-1",
      actionKind: "book",
    }) as Record<string, unknown>;
    const interactive = body.interactive as Record<string, unknown>;
    const text = (interactive.body as { text: string }).text;
    expect(text.length).toBe(1024);
  });
});

// ── runConfirmButtons: pre-flight checks ─────────────────────

describe("runConfirmButtons pre-flight checks", () => {
  it("returns 400 on a malformed body", async () => {
    const { supabase } = makeFake(freshTables());
    const deps = freshDeps(supabase);
    const result = await runConfirmButtons(deps, freshBody({ summary_text: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(deps.callMeta).not.toHaveBeenCalled();
  });

  it("returns 404 when the booking action does not exist", async () => {
    const { supabase } = makeFake(freshTables());
    const deps = freshDeps(supabase);
    const result = await runConfirmButtons(
      deps,
      freshBody({ booking_action_id: "missing" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.reason).toBe("booking action not found");
    }
    expect(deps.callMeta).not.toHaveBeenCalled();
  });

  it("returns 422 when the booking action belongs to a different conversation", async () => {
    const tables = freshTables();
    tables.whatsapp_booking_actions[0].conversation_id = "conv-OTHER";
    const { supabase } = makeFake(tables);
    const deps = freshDeps(supabase);
    const result = await runConfirmButtons(deps, freshBody());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(422);
    expect(deps.callMeta).not.toHaveBeenCalled();
  });

  it("returns 409 when the booking action is no longer pending (sequential retry)", async () => {
    const tables = freshTables();
    tables.whatsapp_booking_actions[0].state = "awaiting_customer_confirm";
    const { supabase } = makeFake(tables);
    const deps = freshDeps(supabase);
    const result = await runConfirmButtons(deps, freshBody());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.reason).toContain("not pending");
    }
    expect(deps.callMeta).not.toHaveBeenCalled();
  });

  it("returns 422 when the conversation has no phone number", async () => {
    const tables = freshTables();
    tables.whatsapp_conversations[0].phone_e164 = "";
    const { supabase } = makeFake(tables);
    const deps = freshDeps(supabase);
    const result = await runConfirmButtons(deps, freshBody());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(422);
    expect(deps.callMeta).not.toHaveBeenCalled();
  });
});

// ── runConfirmButtons: happy path ────────────────────────────

describe("runConfirmButtons happy path", () => {
  it("sends one Meta message and transitions the row to awaiting_customer_confirm", async () => {
    const { supabase, db } = makeFake(freshTables());
    const deps = freshDeps(supabase, "wamid.HBgL");
    const result = await runConfirmButtons(deps, freshBody());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta_message_id).toBe("wamid.HBgL");
    expect(deps.callMeta).toHaveBeenCalledTimes(1);
    expect(deps.recordOutbound).toHaveBeenCalledTimes(1);

    const row = db.tables.whatsapp_booking_actions[0];
    expect(row.state).toBe("awaiting_customer_confirm");
    expect(row.customer_confirm_message_id).toBe("wamid.HBgL");
    const expiresAt = new Date(row.customer_confirm_expires_at as string);
    const expected = new Date("2026-05-12T07:00:00Z").getTime() + CONFIRM_BUTTON_TTL_MS;
    expect(expiresAt.getTime()).toBe(expected);
  });
});

// ── runConfirmButtons: Meta failure path ─────────────────────

describe("runConfirmButtons Meta failure", () => {
  it("returns 502 and leaves the row at 'pending' so a retry or staff can take over", async () => {
    const { supabase, db } = makeFake(freshTables());
    const deps = freshDeps(supabase, null, () =>
      Promise.reject(new Error("Meta 500 — temporary outage")),
    );

    const result = await runConfirmButtons(deps, freshBody());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.reason).toContain("Meta");
    }

    const row = db.tables.whatsapp_booking_actions[0];
    expect(row.state).toBe("pending");
    expect(row.customer_confirm_message_id).toBeNull();
  });
});

// ── runConfirmButtons: concurrent-retry race ─────────────────
// This is the regression test for the gap flagged by the code-
// review of commit 02df9bd. Two concurrent invocations must
// produce ONE Meta send and ONE 409 — never two button prompts
// in the customer's inbox.

describe("runConfirmButtons concurrent retry", () => {
  it("two concurrent calls send only ONE Meta message (one wins, one 409)", async () => {
    const { supabase, db } = makeFake(freshTables());
    const deps = freshDeps(supabase, "wamid.WIN");

    const [r1, r2] = await Promise.all([
      runConfirmButtons(deps, freshBody()),
      runConfirmButtons(deps, freshBody()),
    ]);

    expect(deps.callMeta).toHaveBeenCalledTimes(1);

    const oks = [r1, r2].filter((r) => r.ok);
    const fails = [r1, r2].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    if (!fails[0].ok) {
      expect(fails[0].status).toBe(409);
    }

    const row = db.tables.whatsapp_booking_actions[0];
    expect(row.state).toBe("awaiting_customer_confirm");
    expect(row.customer_confirm_message_id).toBe("wamid.WIN");
  });
});
