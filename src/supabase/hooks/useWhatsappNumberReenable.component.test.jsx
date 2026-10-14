import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { rpc: () => {} },
  getNumberOptOutScope: vi.fn(),
  reenableNumber: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../client", () => ({
  get supabase() {
    return mocks.client;
  },
}));

vi.mock("../repositories/whatsappOptOutRepo", () => ({
  getNumberOptOutScope: mocks.getNumberOptOutScope,
  reenableNumber: mocks.reenableNumber,
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { useWhatsappNumberReenable } from "./useWhatsappNumberReenable";

const PHONE = "07700 900123";
const SARAH = "11111111-1111-4111-8111-111111111111";
const TOM = "22222222-2222-4222-8222-222222222222";
const STOP = "2026-10-03T13:05:00.123456+00:00";
const LATER_STOP = "2026-10-14T13:32:00.000001+00:00";
const NOTE = "Rang the salon on 14 Oct and asked for reminders again.";

function scope(overrides = {}) {
  return {
    phone: PHONE,
    phoneKey: "7700900123",
    numberStoppedAt: STOP,
    lastStopAt: STOP,
    records: [{ id: SARAH, name: "Sarah Jones", phone: PHONE, reason: "asked_on_whatsapp", optedOutAt: STOP }],
    ...overrides,
  };
}
const EMPTY = { phone: PHONE, phoneKey: "7700900123", numberStoppedAt: null, lastStopAt: null, records: [] };

const ok = (value) => ({ value, error: null });
const fail = (code, details = null, thrown = false) => ({
  value: null,
  error: { code, message: "refused", details, thrown },
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderReenable(props = {}) {
  const onReenabled = vi.fn();
  const initialProps = { phone: PHONE, context: "profile", currentHumanId: SARAH, onReenabled, ...props };
  const rendered = renderHook((p) => useWhatsappNumberReenable(p), { initialProps });
  return { ...rendered, onReenabled, initialProps };
}

async function renderReady(props = {}, first = scope()) {
  mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(first));
  const rendered = renderReenable(props);
  await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
  act(() => rendered.result.current.setNote(NOTE));
  return rendered;
}

beforeEach(() => {
  mocks.client = { rpc: () => {} };
  mocks.getNumberOptOutScope.mockReset();
  mocks.reenableNumber.mockReset();
  mocks.loggerError.mockReset();
});

describe("useWhatsappNumberReenable: reading the scope", () => {
  it("is unavailable on sample data and never reads", () => {
    mocks.client = null;
    const { result } = renderReenable();
    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe("unavailable");
    expect(result.current.canSubmit).toBe(false);
    expect(mocks.getNumberOptOutScope).not.toHaveBeenCalled();
  });

  it("loads, then is ready with the scope", async () => {
    const pending = deferred();
    mocks.getNumberOptOutScope.mockReturnValueOnce(pending.promise);
    const { result } = renderReenable();
    expect(result.current.status).toBe("loading");
    expect(mocks.getNumberOptOutScope).toHaveBeenCalledWith(mocks.client, PHONE);

    await act(async () => pending.resolve(ok(scope())));
    expect(result.current.status).toBe("ready");
    expect(result.current.scope.records[0].id).toBe(SARAH);
    expect(result.current.notice).toBeNull();
    expect(result.current.canSubmit).toBe(false);
  });

  it("drops a stale read", async () => {
    const first = deferred();
    const second = deferred();
    mocks.getNumberOptOutScope.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderReenable();

    act(() => {
      void result.current.reload();
    });
    await act(async () => second.resolve(ok(scope({ records: [] }))));
    expect(result.current.scope.records).toEqual([]);

    await act(async () => first.resolve(ok(scope())));
    expect(result.current.scope.records).toEqual([]);
  });

  it("is already on when nothing is switched off", async () => {
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    const { result } = renderReenable();
    await waitFor(() => expect(result.current.status).toBe("already_on"));
    expect(result.current.alreadyOnReason).toBe("empty");
  });

  it.each([
    ["42501", null, "not_staff"],
    ["P0001", "invalid_phone", "invalid_phone"],
    ["PGRST202", null, "not_deployed"],
  ])("is blocked on %s %s", async (code, details, kind) => {
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail(code, details));
    const { result } = renderReenable();
    await waitFor(() => expect(result.current.status).toBe("blocked"));
    expect(result.current.errorKind).toBe(kind);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("offers another go after a failed read, and reloads", async () => {
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("", null, true));
    const { result } = renderReenable();
    await waitFor(() => expect(result.current.status).toBe("load_error"));
    expect(result.current.errorKind).toBe("network");

    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    await act(async () => result.current.reload());
    expect(result.current.status).toBe("ready");
  });

  it("a reload with nothing changed clears the notice; a new STOP clears the note", async () => {
    const { result } = await renderReady();
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    await act(async () => result.current.reload());
    expect(result.current.notice).toBeNull();
    expect(result.current.note).toBe(NOTE);

    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ lastStopAt: LATER_STOP })));
    await act(async () => result.current.reload());
    expect(result.current.notice).toEqual({ kind: "new_stop", at: LATER_STOP });
    expect(result.current.note).toBe("");
    expect(result.current.noteTouched).toBe(false);
  });

  it("flags a profile whose own record is no longer in scope", async () => {
    const { result } = await renderReady({ currentHumanId: TOM });
    expect(result.current.staleProfile).toBe(true);

    const inbox = await renderReady({ context: "inbox", currentHumanId: TOM });
    expect(inbox.result.current.staleProfile).toBe(false);
  });

  it("holds confirm while the live list shows a newer STOP", async () => {
    const { result, rerender, initialProps } = await renderReady({ context: "inbox", observedLastStopAt: STOP });
    expect(result.current.liveNewStop).toBe(false);
    expect(result.current.canSubmit).toBe(true);

    rerender({ ...initialProps, observedLastStopAt: LATER_STOP });
    expect(result.current.liveNewStop).toBe(true);
    expect(result.current.canSubmit).toBe(false);
  });
});

describe("useWhatsappNumberReenable: the note", () => {
  it("needs ten characters before confirm, and marks the field touched", async () => {
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    const { result } = renderReenable();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.noteTouched).toBe(false);

    act(() => result.current.setNote(" 123456789 "));
    expect(result.current.noteTouched).toBe(true);
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setNote("1234567890"));
    expect(result.current.canSubmit).toBe(true);
  });
});

describe("useWhatsappNumberReenable: submitting", () => {
  it("submits the loaded scope object unchanged and reports what was switched on", async () => {
    const { result, onReenabled } = await renderReady();
    const loaded = result.current.scope;
    mocks.reenableNumber.mockResolvedValueOnce(
      ok({ phoneKey: "7700900123", humanIds: [SARAH], conversationIds: ["c1"], auditId: "a1" }),
    );

    await act(async () => result.current.submit());

    expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
    expect(mocks.reenableNumber.mock.calls[0][1]).toBe(loaded);
    expect(mocks.reenableNumber.mock.calls[0][2]).toBe(NOTE);
    expect(result.current.status).toBe("done");
    expect(onReenabled).toHaveBeenCalledWith(
      { humanIds: [SARAH], conversationIds: ["c1"], auditId: "a1" },
      "done",
    );
  });

  it("refuses a second submit while one is in flight", async () => {
    const { result } = await renderReady();
    const pending = deferred();
    mocks.reenableNumber.mockReturnValueOnce(pending.promise);

    act(() => {
      void result.current.submit();
      void result.current.submit();
    });
    expect(result.current.status).toBe("submitting");
    expect(result.current.canSubmit).toBe(false);
    await act(async () => {
      void result.current.submit();
      pending.resolve(ok({ phoneKey: "k", humanIds: [], conversationIds: [], auditId: "a" }));
    });
    expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
  });

  it("does nothing until the note is long enough", async () => {
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    const { result } = renderReenable();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => result.current.submit());
    expect(mocks.reenableNumber).not.toHaveBeenCalled();
  });

  it("on scope_changed with the same STOP, reads once more, shows the change and keeps the note", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    const tom = { id: TOM, name: "Tom Jones", phone: PHONE, reason: "Asked by phone", optedOutAt: null };
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ records: [...scope().records, tom] })));

    await act(async () => result.current.submit());

    expect(mocks.getNumberOptOutScope).toHaveBeenCalledTimes(2);
    expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
    expect(result.current.notice).toEqual({
      kind: "scope_changed",
      diff: { newStop: false, added: ["Tom Jones"], removed: [], cleared: false },
    });
    expect(result.current.note).toBe(NOTE);
    expect(result.current.scope.records).toHaveLength(2);
  });

  it("on a moved STOP, says so and clears the note", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ lastStopAt: LATER_STOP })));

    await act(async () => result.current.submit());

    expect(result.current.notice).toEqual({ kind: "new_stop", at: LATER_STOP });
    expect(result.current.note).toBe("");
    expect(result.current.noteTouched).toBe(false);
    expect(result.current.canSubmit).toBe(false);
    expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
  });

  it("treats a lock or timeout like a changed scope", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("40P01"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));

    await act(async () => result.current.submit());

    expect(mocks.getNumberOptOutScope).toHaveBeenCalledTimes(2);
    expect(result.current.notice).toEqual({
      kind: "busy",
      diff: { newStop: false, added: [], removed: [], cleared: false },
    });
    expect(result.current.note).toBe(NOTE);
    expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
  });

  it("when the re-read is empty, someone else got there first", async () => {
    const { result, onReenabled } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));

    await act(async () => result.current.submit());

    expect(result.current.status).toBe("already_on");
    expect(result.current.alreadyOnReason).toBe("someone_else");
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
  });

  it("nothing_to_reenable reads again and is already on", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "nothing_to_reenable"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));

    await act(async () => result.current.submit());

    expect(result.current.status).toBe("already_on");
    expect(result.current.alreadyOnReason).toBe("someone_else");
  });

  it("a failed re-read after a refusal offers another go", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("57014"));

    await act(async () => result.current.submit());

    expect(result.current.status).toBe("load_error");
    expect(result.current.errorKind).toBe("busy");
  });

  it("keeps the note when the server wants a longer one", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "permission_note_required"));

    await act(async () => result.current.submit());

    expect(result.current.status).toBe("ready");
    expect(result.current.notice).toEqual({ kind: "submit_error", error: "note_required" });
    expect(result.current.note).toBe(NOTE);
    expect(mocks.getNumberOptOutScope).toHaveBeenCalledTimes(1);
  });

  it("keeps the note on any other server error", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("23514", "Failing row contains (Sarah Jones, 07700 900123)"));

    await act(async () => result.current.submit());

    expect(result.current.notice).toEqual({ kind: "submit_error", error: "unknown" });
    expect(result.current.note).toBe(NOTE);
    expect(result.current.canSubmit).toBe(true);
  });

  it.each([
    ["42501", null, "not_staff"],
    ["P0001", "invalid_phone", "invalid_phone"],
    ["PGRST202", null, "not_deployed"],
  ])("is blocked when the re-enable answers %s %s", async (code, details, kind) => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail(code, details));
    await act(async () => result.current.submit());
    expect(result.current.status).toBe("blocked");
    expect(result.current.errorKind).toBe(kind);
  });

  describe("when the connection drops", () => {
    it("verifies, and finds it went through", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", "TypeError: Failed to fetch"));
      const check = deferred();
      mocks.getNumberOptOutScope.mockReturnValueOnce(check.promise);

      act(() => {
        void result.current.submit();
      });
      await waitFor(() => expect(result.current.status).toBe("verifying"));
      await act(async () => check.resolve(ok(EMPTY)));

      expect(result.current.status).toBe("done");
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "done");
      expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
    });

    it("verifies, and finds nothing was applied", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));

      await act(async () => result.current.submit());

      expect(result.current.status).toBe("ready");
      expect(result.current.notice).toEqual({ kind: "not_applied" });
      expect(result.current.note).toBe(NOTE);
      expect(onReenabled).not.toHaveBeenCalled();
    });

    it("verifies, and finds the number changed", async () => {
      const { result } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ lastStopAt: LATER_STOP })));

      await act(async () => result.current.submit());

      expect(result.current.notice).toEqual({ kind: "new_stop", at: LATER_STOP });
      expect(result.current.note).toBe("");
    });

    it("cannot confirm either way when the check fails too", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("", null, true));

      await act(async () => result.current.submit());

      expect(result.current.status).toBe("ready");
      expect(result.current.notice).toEqual({ kind: "unconfirmed" });
      expect(onReenabled).not.toHaveBeenCalled();
    });
  });
});

describe("useWhatsappNumberReenable: logging", () => {
  it("reports unknown and network failures without the phone, a name or the note", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("23514", "Failing row contains (Sarah Jones, 07700 900123)"));
    await act(async () => result.current.submit());
    mocks.reenableNumber.mockResolvedValueOnce(fail("", "Sarah Jones 07700 900123", true));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("", "Sarah Jones 07700 900123", true));
    await act(async () => result.current.submit());

    expect(mocks.loggerError).toHaveBeenCalledTimes(3);
    for (const args of mocks.loggerError.mock.calls) {
      const logged = JSON.stringify(args, (_key, value) =>
        value instanceof Error ? { message: value.message, stack: undefined } : value,
      );
      expect(logged).not.toMatch(/07700|900123|7700900123|\+44/);
      expect(logged).not.toMatch(/Sarah|Jones/);
      expect(logged).not.toContain("Rang the salon");
      expect(args[2]).toEqual({ tags: { hook: "useWhatsappNumberReenable", op: expect.stringMatching(/^(scope|reenable)$/) } });
    }
    expect(mocks.loggerError.mock.calls.map((args) => args[2].tags.op)).toEqual(["reenable", "reenable", "scope"]);
    expect(mocks.loggerError.mock.calls[0][1].message).toBe("code=23514 details=none thrown=false");
  });

  it("keeps a machine-readable detail", async () => {
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("P0001", "some_new_code"));
    const { result } = renderReenable();
    await waitFor(() => expect(result.current.status).toBe("load_error"));
    expect(mocks.loggerError.mock.calls[0][1].message).toBe("code=P0001 details=some_new_code thrown=false");
  });
});
