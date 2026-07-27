import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

function setSupabase(value) {
  globalThis.__supabaseMockHumanMutations = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumanMutations;
  },
}));

const { useHumanMutations } = await import("./useHumanMutations");

// Chainable thenable from() stub (trimmed from the useHumans anchor
// harness) — see that file for the full notes.
function makeStub(fromImpl) {
  const fromCalls = [];
  const from = vi.fn((table) => {
    const calls = [];
    const builder = {};
    for (const m of ["select", "insert", "update", "delete", "eq"]) {
      builder[m] = vi.fn((...args) => {
        calls.push({ method: m, args });
        return builder;
      });
    }
    const settle = (terminal) => {
      const op =
        calls.find((c) => ["insert", "update", "delete"].includes(c.method))
          ?.method || "select";
      const ctx = {
        table,
        op,
        terminal,
        calls,
        payload: calls.find((c) => c.method === op)?.args[0],
        arg: (method) => calls.find((c) => c.method === method)?.args,
      };
      fromCalls.push(ctx);
      const result = fromImpl?.(ctx);
      return Promise.resolve(
        result !== undefined
          ? result
          : terminal === "await"
            ? { data: [], error: null }
            : { data: null, error: null },
      );
    };
    builder.single = vi.fn(() => settle("single"));
    builder.then = (onResolve, onReject) =>
      settle("await").then(onResolve, onReject);
    return builder;
  });
  return { from, _fromCalls: fromCalls };
}

const h1 = {
  id: "h1",
  name: "Sarah",
  surname: "Jones",
  fullName: "Sarah Jones",
  phone: "07700900111",
  notes: "",
  trustedIds: [],
  trustedContacts: [],
};

// Host harness: the composer owns the maps via useState in useHumansData;
// here a tiny stand-in owns them so optimistic updates and rollbacks are
// observable through real state.
function useHarness({ replaceTrustedLinks }) {
  const [humans, setHumans] = useState({ "Sarah Jones": h1 });
  const [humansById, setHumansById] = useState({ h1 });
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(1);
  const mutations = useHumanMutations({
    humans,
    humansById,
    setHumans,
    setHumansById,
    setError,
    setTotalCount,
    replaceTrustedLinks,
  });
  return { humans, humansById, error, totalCount, ...mutations };
}

function renderMutations({ stub, replaceTrustedLinks } = {}) {
  setSupabase(stub ?? makeStub());
  return renderHook(() =>
    useHarness({ replaceTrustedLinks: replaceTrustedLinks ?? vi.fn() }),
  );
}

beforeEach(() => {
  setSupabase(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHumanMutations updateHuman", () => {
  it("maps camelCase updates to DB columns and strips phone format chars", async () => {
    const stub = makeStub((ctx) =>
      ctx.table === "humans" && ctx.op === "update"
        ? { data: { ...h1, ...ctx.payload }, error: null }
        : undefined,
    );
    const { result } = renderMutations({ stub });

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", {
        notes: "Prefers Saturdays",
        // iOS Contacts wraps pasted numbers in bidi marks (Cf chars); the
        // hook must strip those but keep visible spacing.
        phone: "‭07700 900123‬",
        historyFlag: "vip",
      });
    });

    const update = stub._fromCalls.find((c) => c.op === "update");
    expect(update.arg("eq")).toEqual(["id", "h1"]);
    expect(update.payload).toEqual({
      notes: "Prefers Saturdays",
      phone: "07700 900123",
      history_flag: "vip",
    });
    expect(saved.notes).toBe("Prefers Saturdays");
    expect(result.current.humans["Sarah Jones"].notes).toBe("Prefers Saturdays");
  });

  it("persists the per-customer AI WhatsApp preference", async () => {
    const stub = makeStub((ctx) =>
      ctx.table === "humans" && ctx.op === "update"
        ? { data: { ...h1, ...ctx.payload }, error: null }
        : undefined,
    );
    const { result } = renderMutations({ stub });

    await act(async () => {
      await result.current.updateHuman("h1", {
        aiWhatsappAllowed: false,
      });
    });

    const update = stub._fromCalls.find((call) => call.op === "update");
    expect(update.payload).toEqual({ ai_whatsapp_allowed: false });
    expect(result.current.humans["Sarah Jones"].aiWhatsappAllowed).toBe(false);
  });

  it("rolls back the optimistic update and surfaces the error on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeStub((ctx) =>
      ctx.op === "update" ? { data: null, error: { message: "rls denied" } } : undefined,
    );
    const { result } = renderMutations({ stub });

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", { notes: "nope" });
    });

    expect(saved).toBeNull();
    expect(result.current.error).toBe("rls denied");
    expect(result.current.humans["Sarah Jones"].notes).toBe("");
  });

  it("returns null without touching the DB for an unknown identifier", async () => {
    const stub = makeStub();
    const { result } = renderMutations({ stub });

    expect(await result.current.updateHuman("nobody", { notes: "x" })).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("delegates trusted-only updates to replaceTrustedLinks — no humans UPDATE", async () => {
    const stub = makeStub();
    const replaceTrustedLinks = vi.fn(async () => ({
      ok: true,
      trustedNames: ["Dave Smith"],
      savedTrustedContacts: [
        { id: "h2", fullName: "Dave Smith", relationship: "" },
      ],
    }));
    const { result } = renderMutations({ stub, replaceTrustedLinks });

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", { trustedIds: ["h2"] });
    });

    expect(replaceTrustedLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        humanId: "h1",
        updates: { trustedIds: ["h2"] },
        currentTrustedContacts: [],
      }),
    );
    expect(saved.trustedIds).toEqual(["Dave Smith"]);
    expect(saved.trustedContacts).toEqual([
      { id: "h2", fullName: "Dave Smith", relationship: "" },
    ]);
    // Trusted-only updates must not issue a humans UPDATE.
    expect(stub._fromCalls.some((c) => c.op === "update")).toBe(false);
  });

  it("rolls back local state when replaceTrustedLinks fails", async () => {
    const replaceTrustedLinks = vi.fn(async () => ({
      ok: false,
      error: { message: "insert denied" },
    }));
    const { result } = renderMutations({ replaceTrustedLinks });

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", { trustedIds: ["h2"] });
    });

    expect(saved).toBeNull();
    expect(result.current.error).toBe("insert denied");
    expect(result.current.humans["Sarah Jones"].trustedIds).toEqual([]);
  });
});

describe("useHumanMutations addHuman", () => {
  it("inserts a sanitised row and folds the saved human into both maps", async () => {
    const stub = makeStub((ctx) =>
      ctx.op === "insert" ? { data: { id: "h9", ...ctx.payload }, error: null } : undefined,
    );
    const { result } = renderMutations({ stub });

    let saved;
    await act(async () => {
      saved = await result.current.addHuman({
        name: "New",
        surname: "Person",
        phone: "‪07700900999‬",
        whatsapp: true,
      });
    });

    const insert = stub._fromCalls.find((c) => c.op === "insert");
    expect(insert.payload).toMatchObject({
      name: "New",
      surname: "Person",
      phone: "07700900999",
      whatsapp: true,
    });
    expect(saved.fullName).toBe("New Person");
    expect(result.current.humans["New Person"].id).toBe("h9");
    expect(result.current.humansById.h9.fullName).toBe("New Person");
  });

  it("translates a unique-constraint violation into a friendly duplicate error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeStub((ctx) =>
      ctx.op === "insert"
        ? { data: null, error: { code: "23505", message: "duplicate key" } }
        : undefined,
    );
    const { result } = renderMutations({ stub });

    let thrown;
    await act(async () => {
      thrown = await result.current
        .addHuman({ name: "New", surname: "Person" })
        .catch((e) => e);
    });

    expect(thrown.message).toBe(
      "New Person already exists. Please use a different name.",
    );
    expect(result.current.error).toBe(thrown.message);
    expect(result.current.humans["New Person"]).toBeUndefined();
  });
});

describe("useHumanMutations deleteHuman", () => {
  it("guards against a missing id and an unknown human", async () => {
    const stub = makeStub();
    const { result } = renderMutations({ stub });

    expect(await result.current.deleteHuman("")).toEqual({
      ok: false,
      error: "Missing human id",
    });
    expect(await result.current.deleteHuman("nope")).toEqual({
      ok: false,
      error: "Human not found",
    });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("optimistically removes the human and decrements the count on success", async () => {
    const stub = makeStub((ctx) => (ctx.op === "delete" ? { error: null } : undefined));
    const { result } = renderMutations({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.deleteHuman("h1");
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.humansById.h1).toBeUndefined();
    expect(result.current.humans["Sarah Jones"]).toBeUndefined();
    expect(result.current.totalCount).toBe(0);
  });

  it("rolls back and explains the FK failure when the human is a pickup contact", async () => {
    const stub = makeStub((ctx) =>
      ctx.op === "delete"
        ? { error: { code: "23503", message: "violates foreign key" } }
        : undefined,
    );
    const { result } = renderMutations({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.deleteHuman("h1");
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/pickup contact/);
    expect(result.current.humansById.h1.id).toBe("h1");
    expect(result.current.humans["Sarah Jones"].id).toBe("h1");
  });
});
