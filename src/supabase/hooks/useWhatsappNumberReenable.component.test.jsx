import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { rpc: () => {} },
  getNumberOptOutScope: vi.fn(),
  reenableNumber: vi.fn(),
  listNumberReenables: vi.fn(),
  getSignedInUserId: vi.fn(),
  getWhatsappOptOutNow: vi.fn(),
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
  listNumberReenables: mocks.listNumberReenables,
  getSignedInUserId: mocks.getSignedInUserId,
  getWhatsappOptOutNow: mocks.getWhatsappOptOutNow,
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
// The signed-in member of staff, and another one.
const ME = "99999999-9999-4999-8999-999999999999";
const COLLEAGUE = "88888888-8888-4888-8888-888888888888";
// Between STOP and LATER_STOP: a re-enable made after staff read the scope.
const REENABLED_AT = "2026-10-14T13:00:00.000002+00:00";
const AUDIT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVERSATION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

/** One whatsapp_opt_out_reenables row, as the repository maps it. */
function auditRow(overrides = {}) {
  return {
    id: AUDIT_ID,
    humanIds: [SARAH],
    conversationIds: [CONVERSATION],
    permissionNote: NOTE,
    reenabledBy: ME,
    reenabledAt: REENABLED_AT,
    ...overrides,
  };
}

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
  mocks.listNumberReenables.mockReset();
  mocks.listNumberReenables.mockResolvedValue(ok([]));
  mocks.getSignedInUserId.mockReset();
  mocks.getSignedInUserId.mockResolvedValue(ok(ME));
  // Each record as it reads now: back on if the last audit answer lists it
  // (only a re-enable switches a record back on), otherwise still off.
  mocks.getWhatsappOptOutNow.mockReset();
  mocks.getWhatsappOptOutNow.mockImplementation(async (_client, ids) => {
    const last = mocks.listNumberReenables.mock.results.at(-1)?.value;
    const answer = last ? await last : null;
    const listed = new Set((answer?.value ?? []).flatMap((row) => row.humanIds));
    return ok(Object.fromEntries(ids.map((id) => [id, !listed.has(id)])));
  });
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

  it("flags a profile whose own record is no longer in scope, and holds confirm", async () => {
    const { result } = await renderReady({ currentHumanId: TOM });
    expect(result.current.staleProfile).toBe(true);
    // The note is long enough; the stale profile alone holds confirm.
    expect(result.current.canSubmit).toBe(false);
    await act(async () => result.current.submit());
    expect(mocks.reenableNumber).not.toHaveBeenCalled();

    const inbox = await renderReady({ context: "inbox", currentHumanId: TOM });
    expect(inbox.result.current.staleProfile).toBe(false);
    expect(inbox.result.current.canSubmit).toBe(true);
  });

  it("stays on the number it opened with when the record's number changes", async () => {
    const { result, rerender, initialProps } = await renderReady();
    expect(result.current.canSubmit).toBe(true);

    // The same number, saved in another format: nothing to warn about.
    rerender({ ...initialProps, phone: "+447700900123" });
    expect(result.current.staleProfile).toBe(false);
    expect(result.current.canSubmit).toBe(true);

    // A different number: never read it, say the profile is out of date, hold confirm.
    rerender({ ...initialProps, phone: "07700 900456" });
    expect(mocks.getNumberOptOutScope).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
    expect(result.current.note).toBe(NOTE);
    expect(result.current.staleProfile).toBe(true);
    expect(result.current.canSubmit).toBe(false);

    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    await act(async () => result.current.reload());
    expect(mocks.getNumberOptOutScope).toHaveBeenLastCalledWith(mocks.client, PHONE);

    rerender({ ...initialProps, phone: "" });
    expect(result.current.staleProfile).toBe(true);
    expect(result.current.canSubmit).toBe(false);
  });

  it("holds confirm in the inbox too if the chat's number ever changed", async () => {
    const { result, rerender, initialProps } = await renderReady({ context: "inbox", currentHumanId: null });
    rerender({ ...initialProps, phone: "07700 900456" });
    expect(result.current.staleProfile).toBe(false);
    expect(result.current.canSubmit).toBe(false);
  });

  it("a reload that finds the number cleared reports the records an audit row proves", async () => {
    const { result, onReenabled } = await renderReady();
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));
    await act(async () => result.current.reload());
    expect(result.current.status).toBe("already_on");
    expect(result.current.alreadyOnReason).toBe("switched_on");
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
  });

  it("a first read that is empty reports nothing", async () => {
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    const { result, onReenabled } = renderReenable();
    await waitFor(() => expect(result.current.status).toBe("already_on"));
    expect(onReenabled).not.toHaveBeenCalled();
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

  it("when the re-read is empty and another re-enable is on record, it is already on", async () => {
    const { result, onReenabled } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));

    await act(async () => result.current.submit());

    expect(result.current.status).toBe("already_on");
    expect(result.current.alreadyOnReason).toBe("switched_on");
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
  });

  it("nothing_to_reenable reads again and is already on", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "nothing_to_reenable"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));

    await act(async () => result.current.submit());

    expect(result.current.status).toBe("already_on");
    expect(result.current.alreadyOnReason).toBe("switched_on");
  });

  it("a failed re-read after a refusal offers another go", async () => {
    const { result } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("57014"));

    await act(async () => result.current.submit());

    expect(result.current.status).toBe("load_error");
    expect(result.current.errorKind).toBe("busy");
  });

  it("Try again after a failed re-read that finds the number cleared reports it", async () => {
    const { result, onReenabled } = await renderReady();
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("57014"));
    await act(async () => result.current.submit());
    expect(result.current.status).toBe("load_error");

    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));
    await act(async () => result.current.reload());

    expect(result.current.status).toBe("already_on");
    expect(result.current.alreadyOnReason).toBe("switched_on");
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
    expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
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
    it("verifies, and finds it went through from its own audit row", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", "TypeError: Failed to fetch"));
      const check = deferred();
      mocks.getNumberOptOutScope.mockReturnValueOnce(check.promise);
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));

      act(() => {
        void result.current.submit();
      });
      await waitFor(() => expect(result.current.status).toBe("verifying"));
      await act(async () => check.resolve(ok(EMPTY)));

      expect(result.current.status).toBe("done");
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
        "done",
      );
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

    it("cannot confirm either way when the check fails too, and holds confirm until it can", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("", null, true));

      await act(async () => result.current.submit());

      expect(result.current.status).toBe("ready");
      expect(result.current.notice).toEqual({ kind: "unconfirmed" });
      expect(onReenabled).not.toHaveBeenCalled();
      // "Check again before doing anything else": confirm waits for the outcome.
      expect(result.current.note).toBe(NOTE);
      expect(result.current.canSubmit).toBe(false);
      await act(async () => result.current.submit());
      expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
    });

    async function renderUnconfirmed() {
      const rendered = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("", null, true));
      await act(async () => rendered.result.current.submit());
      expect(rendered.result.current.notice).toEqual({ kind: "unconfirmed" });
      return rendered;
    }

    it("Check again that finds our audit row: this request went through", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      const check = deferred();
      mocks.getNumberOptOutScope.mockReturnValueOnce(check.promise);
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));

      act(() => {
        void result.current.reload();
      });
      expect(result.current.status).toBe("verifying");
      expect(result.current.notice).toBeNull();
      await act(async () => check.resolve(ok(EMPTY)));

      expect(result.current.status).toBe("done");
      expect(result.current.alreadyOnReason).toBeNull();
      expect(onReenabled).toHaveBeenCalledTimes(1);
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
        "done",
      );
      expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
    });

    it("Check again that finds nothing changed: it was not applied, and confirm is back", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));

      await act(async () => result.current.reload());

      expect(result.current.status).toBe("ready");
      expect(result.current.notice).toEqual({ kind: "not_applied" });
      expect(result.current.canSubmit).toBe(true);
      expect(onReenabled).not.toHaveBeenCalled();
    });

    it("Check again that fails again is still unconfirmed, and so is the one after", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("", null, true));
      await act(async () => result.current.reload());
      expect(result.current.notice).toEqual({ kind: "unconfirmed" });
      expect(result.current.canSubmit).toBe(false);

      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));
      await act(async () => result.current.reload());
      expect(result.current.status).toBe("done");
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
        "done",
      );
    });

    it("Check again that finds a new STOP shows it and clears the note", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ lastStopAt: LATER_STOP })));
      await act(async () => result.current.reload());

      expect(result.current.notice).toEqual({ kind: "new_stop", at: LATER_STOP });
      expect(result.current.note).toBe("");
      expect(onReenabled).not.toHaveBeenCalled();

      // Settled: a later reload reads afresh rather than verifying again,
      // against the scope it now shows (switched off since LATER_STOP).
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(
        ok([auditRow({ reenabledBy: COLLEAGUE, reenabledAt: "2026-10-15T09:00:00.000001+00:00" })]),
      );
      await act(async () => result.current.reload());
      expect(mocks.listNumberReenables).toHaveBeenLastCalledWith(mocks.client, "7700900123", STOP, [SARAH]);
      expect(result.current.alreadyOnReason).toBe("switched_on");
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH], conversationIds: [] },
        "already_on",
      );
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

// A record can leave a number's switched-off scope without being switched
// back on: its phone changed, and nothing but the audited re-enable ever
// clears an opt-out. So an outcome is read from whatsapp_opt_out_reenables,
// never guessed from a record being absent. Each test below failed at
// 09629c1, where absence alone patched the host's cache as "back on".
describe("useWhatsappNumberReenable: outcomes come from the audit log", () => {
  const tom = { id: TOM, name: "Tom Jones", phone: PHONE, reason: "Asked by phone", optedOutAt: STOP };
  const sarahAndTom = () => scope({ records: [...scope().records, tom] });

  async function renderUnconfirmed(props = {}, first = scope()) {
    const rendered = await renderReady(props, first);
    mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(fail("", null, true));
    await act(async () => rendered.result.current.submit());
    expect(rendered.result.current.notice).toEqual({ kind: "unconfirmed" });
    return rendered;
  }

  async function submitRefused(rendered, reread, details = "reenable_scope_changed") {
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", details));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(reread));
    await act(async () => rendered.result.current.submit());
  }

  describe("path 1: Check again after an unknown outcome", () => {
    it("a record that moved away with no audit row is not reported as back on", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([]));

      await act(async () => result.current.reload());

      expect(onReenabled).not.toHaveBeenCalled();
      expect(result.current.status).toBe("already_on");
      expect(result.current.alreadyOnReason).toBe("left_number");
      expect(result.current.leftNumber.map((record) => record.id)).toEqual([SARAH]);
      expect(result.current.canSubmit).toBe(false);
    });

    it("reads the audit for the server's phone key and the records' ids, since the earliest switch-off", async () => {
      const { result } = await renderUnconfirmed({}, scope({ phoneKey: "server-key" }));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok({ ...EMPTY, phoneKey: "server-key" }));
      await act(async () => result.current.reload());
      expect(mocks.listNumberReenables).toHaveBeenCalledWith(mocks.client, "server-key", STOP, [SARAH]);
      expect(mocks.getSignedInUserId).toHaveBeenCalledWith(mocks.client);
      // Then each record that left, as it is now.
      expect(mocks.getWhatsappOptOutNow).toHaveBeenCalledWith(mocks.client, [SARAH]);
    });

    it("our own audit row: it went through, reported with the row's ids", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));

      await act(async () => result.current.reload());

      expect(result.current.status).toBe("done");
      expect(onReenabled).toHaveBeenCalledTimes(1);
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
        "done",
      );
    });

    it("someone else's audit row: already on, neutrally, and never 'done'", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));

      await act(async () => result.current.reload());

      expect(result.current.status).toBe("already_on");
      expect(result.current.alreadyOnReason).toBe("switched_on");
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
    });

    it("a row of ours with another note is not this request", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ permissionNote: "Something else entirely." })]));
      await act(async () => result.current.reload());
      expect(result.current.alreadyOnReason).toBe("switched_on");
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
    });

    it("verifies straight after a dropped request the same way", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));

      await act(async () => result.current.submit());

      expect(onReenabled).not.toHaveBeenCalled();
      expect(result.current.alreadyOnReason).toBe("left_number");
    });
  });

  describe("path 2: the re-read after a refused submit", () => {
    it("a record that moved away is not reported, and is named", async () => {
      const rendered = await renderReady();
      await submitRefused(rendered, EMPTY);

      expect(rendered.onReenabled).not.toHaveBeenCalled();
      expect(rendered.result.current.status).toBe("already_on");
      expect(rendered.result.current.alreadyOnReason).toBe("left_number");
      expect(rendered.result.current.leftNumber.map((record) => record.name)).toEqual(["Sarah Jones"]);
    });

    it("reports only the records an audit row proves, and names the rest", async () => {
      const rendered = await renderReady({}, sarahAndTom());
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE, humanIds: [SARAH] })]));
      await submitRefused(rendered, EMPTY);

      expect(rendered.onReenabled).toHaveBeenCalledTimes(1);
      expect(rendered.onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
      expect(rendered.result.current.alreadyOnReason).toBe("switched_on");
      expect(rendered.result.current.leftNumber.map((record) => record.id)).toEqual([TOM]);
    });

    it("a record that moved while others stay shows the rest as the new scope", async () => {
      const rendered = await renderReady({ currentHumanId: SARAH }, sarahAndTom());
      await submitRefused(rendered, scope());

      expect(rendered.onReenabled).not.toHaveBeenCalled();
      expect(rendered.result.current.status).toBe("ready");
      expect(rendered.result.current.scope.records.map((record) => record.id)).toEqual([SARAH]);
      expect(rendered.result.current.leftNumber.map((record) => record.id)).toEqual([TOM]);
      // Tom is named once, by the moved-record line, not again as "no longer switched off".
      expect(rendered.result.current.notice).toEqual({
        kind: "scope_changed",
        diff: { newStop: false, added: [], removed: [], cleared: false },
      });
      expect(rendered.result.current.canSubmit).toBe(true);
    });

    it("whether or not the profile prop shows the moved number", async () => {
      const rendered = await renderReady();
      rendered.rerender({ ...rendered.initialProps, phone: "07700 900456" });
      // Confirm is held by the moved number; a refused submit from before is what re-reads here.
      expect(rendered.result.current.canSubmit).toBe(false);
      rendered.rerender(rendered.initialProps);
      await submitRefused(rendered, EMPTY, "nothing_to_reenable");
      expect(rendered.onReenabled).not.toHaveBeenCalled();
    });

    it("a legacy record with no switch-off time is patched only when a row lists it and it reads as on now", async () => {
      const legacy = { ...tom, optedOutAt: null };
      const rendered = await renderReady({ currentHumanId: TOM }, scope({ records: [legacy] }));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE, humanIds: [TOM] })]));
      await submitRefused(rendered, EMPTY);
      expect(rendered.onReenabled).toHaveBeenCalledWith({ humanIds: [TOM], conversationIds: [] }, "already_on");
      expect(rendered.result.current.alreadyOnReason).toBe("switched_on");

      // Listed, but switched off again since: not patched.
      const again = await renderReady({ currentHumanId: TOM }, scope({ records: [legacy] }));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE, humanIds: [TOM] })]));
      mocks.getWhatsappOptOutNow.mockResolvedValueOnce(ok({ [TOM]: true }));
      await submitRefused(again, EMPTY);
      expect(again.onReenabled).not.toHaveBeenCalled();
      expect(again.result.current.leftNumber.map((record) => record.id)).toEqual([TOM]);

      // Not listed by any row, and on now: not patched, and not said to be off.
      const unlisted = await renderReady({ currentHumanId: TOM }, scope({ records: [legacy] }));
      mocks.getWhatsappOptOutNow.mockResolvedValueOnce(ok({ [TOM]: false }));
      await submitRefused(unlisted, EMPTY);
      expect(unlisted.onReenabled).not.toHaveBeenCalled();
      expect(unlisted.result.current.leftNumber).toEqual([]);
      expect(unlisted.result.current.unconfirmedRecords.map((record) => record.id)).toEqual([TOM]);
      expect(unlisted.result.current.alreadyOnReason).toBe("left_number");
    });

    it("an audit read that fails patches nothing and holds confirm until Check again", async () => {
      const rendered = await renderReady();
      mocks.listNumberReenables.mockResolvedValueOnce(fail("", null, true));
      await submitRefused(rendered, EMPTY);

      expect(rendered.onReenabled).not.toHaveBeenCalled();
      expect(rendered.result.current.status).toBe("ready");
      expect(rendered.result.current.notice).toEqual({ kind: "unconfirmed" });
      expect(rendered.result.current.scope.records.map((record) => record.id)).toEqual([SARAH]);
      expect(rendered.result.current.canSubmit).toBe(false);

      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));
      await act(async () => rendered.result.current.reload());
      expect(rendered.result.current.alreadyOnReason).toBe("switched_on");
      expect(rendered.onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
      expect(mocks.reenableNumber).toHaveBeenCalledTimes(1);
    });

    it("a signed-in user that cannot be read is unconfirmed too", async () => {
      const rendered = await renderReady();
      mocks.getSignedInUserId.mockResolvedValueOnce(fail("NO_SIGNED_IN_USER"));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));
      await submitRefused(rendered, EMPTY);
      expect(rendered.onReenabled).not.toHaveBeenCalled();
      expect(rendered.result.current.notice).toEqual({ kind: "unconfirmed" });
    });
  });

  describe("path 3: a reload after the scope was shown", () => {
    it("a reload that finds the record gone, with no audit row, reports nothing", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));

      await act(async () => result.current.reload());

      expect(onReenabled).not.toHaveBeenCalled();
      expect(result.current.alreadyOnReason).toBe("left_number");
    });

    it("a reload that loses one record reports it only when an audit row proves it", async () => {
      const { result, onReenabled } = await renderReady({}, sarahAndTom());
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE, humanIds: [TOM] })]));

      await act(async () => result.current.reload());

      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [TOM], conversationIds: [] }, "already_on");
      expect(result.current.leftNumber).toEqual([]);
      expect(result.current.status).toBe("ready");
    });

    it("a failed audit read on reload keeps what staff saw and asks to check again", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(fail("PGRST301"));
      await act(async () => result.current.reload());
      expect(onReenabled).not.toHaveBeenCalled();
      expect(result.current.notice).toEqual({ kind: "unconfirmed" });
      expect(result.current.scope.records.map((record) => record.id)).toEqual([SARAH]);
    });
  });

  describe("path 4: our request committed late, then the number said STOP again", () => {
    it("says it went through and is off again, rather than 'nothing was switched on'", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      const restopped = scope({
        lastStopAt: LATER_STOP,
        records: [{ ...scope().records[0], optedOutAt: LATER_STOP }],
      });
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(restopped));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));

      await act(async () => result.current.reload());

      expect(result.current.status).toBe("ready");
      expect(result.current.notice).toEqual({ kind: "stopped_again", at: LATER_STOP });
      expect(result.current.note).toBe("");
      expect(onReenabled).not.toHaveBeenCalled();
      expect(result.current.canSubmit).toBe(false);
    });

    it("with no row of ours, the new STOP still says nothing was switched on", async () => {
      const { result } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ lastStopAt: LATER_STOP })));
      await act(async () => result.current.reload());
      expect(result.current.notice).toEqual({ kind: "new_stop", at: LATER_STOP });
    });
  });

  describe("path 5: a dropped request that commits after 'not applied'", () => {
    it("a second confirm that is refused finds our own late row: done, not someone else", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
      await act(async () => result.current.reload());
      expect(result.current.notice).toEqual({ kind: "not_applied" });
      expect(result.current.canSubmit).toBe(true);

      // The first request lands now; the second one is refused for it.
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));
      await submitRefused({ result }, EMPTY, "nothing_to_reenable");

      expect(result.current.status).toBe("done");
      expect(result.current.alreadyOnReason).toBeNull();
      expect(onReenabled).toHaveBeenCalledTimes(1);
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
        "done",
      );
    });
  });

  describe("our own row, when the number has changed since", () => {
    it("a second confirm refused after a late commit and a new STOP says it went through", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
      await act(async () => result.current.reload());
      expect(result.current.notice).toEqual({ kind: "not_applied" });

      // Nothing left the scope this time (Sarah is back, switched off by the
      // new STOP), but a request of ours was in doubt, so the audit is read.
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));
      await submitRefused(
        { result },
        scope({ lastStopAt: LATER_STOP, records: [{ ...scope().records[0], optedOutAt: LATER_STOP }] }),
      );

      expect(result.current.notice).toEqual({ kind: "stopped_again", at: LATER_STOP });
      expect(onReenabled).not.toHaveBeenCalled();
    });

    it("records switched off again with no new STOP: it went through, and here is the latest", async () => {
      const { result, onReenabled } = await renderUnconfirmed({}, scope({ numberStoppedAt: null, lastStopAt: null }));
      const reticked = scope({
        numberStoppedAt: null,
        lastStopAt: null,
        records: [{ ...scope().records[0], reason: "Asked by phone", optedOutAt: LATER_STOP }],
      });
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(reticked));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));

      await act(async () => result.current.reload());

      expect(result.current.notice).toEqual({ kind: "changed_since" });
      expect(result.current.note).toBe(NOTE);
      expect(result.current.scope).toBe(reticked);
      expect(onReenabled).not.toHaveBeenCalled();
    });

    it("went through, with a legacy record: our row covers it too, so it is done", async () => {
      const legacy = { ...tom, optedOutAt: null };
      const { result, onReenabled } = await renderUnconfirmed({}, scope({ records: [...scope().records, legacy] }));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ humanIds: [SARAH, TOM] })]));

      await act(async () => result.current.reload());

      expect(result.current.status).toBe("done");
      expect(result.current.leftNumber).toEqual([]);
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH, TOM], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
        "done",
      );
    });

    it("went through, then one record moved to a number that said STOP: ours, and that one is still off", async () => {
      const { result, onReenabled } = await renderUnconfirmed({}, sarahAndTom());
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ humanIds: [SARAH, TOM] })]));
      mocks.getWhatsappOptOutNow.mockResolvedValueOnce(ok({ [SARAH]: false, [TOM]: true }));

      await act(async () => result.current.reload());

      expect(result.current.status).toBe("already_on");
      expect(result.current.alreadyOnReason).toBe("ours");
      expect(result.current.leftNumber.map((record) => record.id)).toEqual([TOM]);
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
    });

    it("a number with no customer record: our row clearing its STOP is our request", async () => {
      const { result, onReenabled } = await renderUnconfirmed({ context: "inbox", currentHumanId: null }, scope({ records: [] }));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ humanIds: [] })]));

      await act(async () => result.current.reload());

      expect(mocks.listNumberReenables).toHaveBeenLastCalledWith(mocks.client, "7700900123", STOP, []);
      expect(result.current.status).toBe("done");
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [], conversationIds: [CONVERSATION], auditId: AUDIT_ID }, "done");
    });
  });

  it("Check again after an unreadable audit shows the check, and repeats it against what staff saw", async () => {
    const rendered = await renderReady({}, sarahAndTom());
    mocks.listNumberReenables.mockResolvedValueOnce(fail("", null, true));
    await submitRefused(rendered, scope());
    expect(rendered.result.current.notice).toEqual({ kind: "unconfirmed" });

    const check = deferred();
    mocks.getNumberOptOutScope.mockReturnValueOnce(check.promise);
    act(() => {
      void rendered.result.current.reload();
    });
    expect(rendered.result.current.status).toBe("loading");
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE, humanIds: [TOM] })]));
    await act(async () => check.resolve(ok(scope())));

    // Settled against Sarah and Tom, as staff were shown, so Tom is reported.
    expect(rendered.onReenabled).toHaveBeenCalledWith({ humanIds: [TOM], conversationIds: [] }, "already_on");
    expect(rendered.result.current.notice).toEqual({
      kind: "scope_changed",
      diff: { newStop: false, added: [], removed: ["Tom Jones"], cleared: false },
    });
  });

  it("logs an unreadable audit by code only", async () => {
    const rendered = await renderReady();
    mocks.listNumberReenables.mockResolvedValueOnce(fail("", "Sarah Jones 07700 900123", true));
    mocks.getSignedInUserId.mockResolvedValueOnce(fail("AuthSessionMissingError", "no_session"));
    await submitRefused(rendered, EMPTY);
    const audit = mocks.loggerError.mock.calls.filter((args) => args[2].tags.op === "audit");
    expect(audit.map((args) => [args[0], args[1].message])).toEqual([
      ["WhatsApp re-enable audit read failed", "code=none details=none thrown=true"],
      ["WhatsApp re-enable audit read failed", "code=AuthSessionMissingError details=no_session thrown=false"],
    ]);
    expect(JSON.stringify(audit.map((args) => args[1].message))).not.toMatch(/Sarah|07700/);
  });

  it("finds a late row by the note that request carried, even after the note was edited", async () => {
    const { result, onReenabled } = await renderUnconfirmed();
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    await act(async () => result.current.reload());
    expect(result.current.notice).toEqual({ kind: "not_applied" });

    act(() => result.current.setNote("Asked again in the salon on 15 Oct."));
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ permissionNote: NOTE })]));
    await submitRefused({ result }, EMPTY, "nothing_to_reenable");

    expect(mocks.reenableNumber.mock.calls.map((call) => call[2])).toEqual([NOTE, "Asked again in the salon on 15 Oct."]);
    expect(result.current.status).toBe("done");
    expect(onReenabled).toHaveBeenCalledWith(
      { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
      "done",
    );
  });

  it("drops an audit read that finishes after the dialog closed", async () => {
    const rendered = await renderReady();
    const audit = deferred();
    mocks.listNumberReenables.mockReturnValueOnce(audit.promise);
    mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    act(() => {
      void rendered.result.current.submit();
    });
    await waitFor(() => expect(mocks.listNumberReenables).toHaveBeenCalled());
    rendered.unmount();
    await act(async () => audit.resolve(ok([auditRow({ reenabledBy: COLLEAGUE })])));
    expect(rendered.onReenabled).not.toHaveBeenCalled();
  });

  // Review of d0f33bf: each test below failed there (or, for a guard that
  // was already right, fails under the mutation it names).
  describe("a row is a past re-enable, not the record's state now", () => {
    it("a record a colleague's row proves, switched off again and moved away, is not reported", async () => {
      // A colleague switched Sarah back on (row), the number said STOP again
      // (Sarah off again), then her phone changed: she left the scope still off.
      const rendered = await renderReady();
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));
      mocks.getWhatsappOptOutNow.mockResolvedValueOnce(ok({ [SARAH]: true }));
      await submitRefused(rendered, scope({ records: [], lastStopAt: LATER_STOP }));

      expect(mocks.getWhatsappOptOutNow).toHaveBeenCalledWith(mocks.client, [SARAH]);
      expect(rendered.onReenabled).not.toHaveBeenCalled();
      expect(rendered.result.current.notice).toEqual({ kind: "new_stop", at: LATER_STOP });
      expect(rendered.result.current.leftNumber.map((record) => record.id)).toEqual([SARAH]);
    });

    it("the same on a reload that finds the number cleared", async () => {
      const { result, onReenabled } = await renderReady({ context: "inbox", currentHumanId: null });
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));
      mocks.getWhatsappOptOutNow.mockResolvedValueOnce(ok({ [SARAH]: true }));
      await act(async () => result.current.reload());
      expect(onReenabled).not.toHaveBeenCalled();
      expect(result.current.alreadyOnReason).toBe("left_number");
      expect(result.current.leftNumber.map((record) => record.id)).toEqual([SARAH]);
    });

    it("our own row is not enough either: a record off again now is not part of 'done'", async () => {
      const { result, onReenabled } = await renderUnconfirmed();
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));
      mocks.getWhatsappOptOutNow.mockResolvedValueOnce(ok({ [SARAH]: true }));
      await act(async () => result.current.reload());
      expect(result.current.status).toBe("already_on");
      expect(result.current.alreadyOnReason).toBe("ours");
      expect(onReenabled).not.toHaveBeenCalled();
      expect(result.current.leftNumber.map((record) => record.id)).toEqual([SARAH]);
    });

    it("a state read that fails patches nothing and holds confirm behind Check again", async () => {
      const rendered = await renderReady();
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));
      mocks.getWhatsappOptOutNow.mockResolvedValueOnce(fail("", null, true));
      await submitRefused(rendered, EMPTY);

      expect(rendered.onReenabled).not.toHaveBeenCalled();
      expect(rendered.result.current.status).toBe("ready");
      expect(rendered.result.current.notice).toEqual({ kind: "unconfirmed" });
      expect(rendered.result.current.canSubmit).toBe(false);
      const state = mocks.loggerError.mock.calls.filter((args) => args[2].tags.op === "state");
      expect(state.map((args) => [args[0], args[1].message])).toEqual([
        ["WhatsApp opt-out state read failed", "code=none details=none thrown=true"],
      ]);
    });

    it("drops a state read that finishes after the dialog closed", async () => {
      const rendered = await renderReady();
      const states = deferred();
      mocks.getWhatsappOptOutNow.mockReturnValueOnce(states.promise);
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ reenabledBy: COLLEAGUE })]));
      mocks.reenableNumber.mockResolvedValueOnce(fail("P0001", "reenable_scope_changed"));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      act(() => {
        void rendered.result.current.submit();
      });
      await waitFor(() => expect(mocks.getWhatsappOptOutNow).toHaveBeenCalled());
      rendered.unmount();
      await act(async () => states.resolve(ok({ [SARAH]: false })));
      expect(rendered.onReenabled).not.toHaveBeenCalled();
    });

    it("finds a record switched back on under its new number, by its id", async () => {
      // Sarah's phone changed, staying off; she was then switched back on
      // under the new number, so the row is under that number's key.
      const { result, onReenabled } = await renderReady({ context: "inbox", currentHumanId: null });
      const underNewNumber = auditRow({ reenabledBy: COLLEAGUE, conversationIds: [] });
      mocks.listNumberReenables.mockImplementationOnce(async (_client, _key, _since, ids = []) =>
        ok(ids.includes(SARAH) ? [underNewNumber] : []),
      );
      // This number still has its STOP, so its scope is not empty.
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ records: [] })));

      await act(async () => result.current.reload());

      expect(mocks.listNumberReenables).toHaveBeenLastCalledWith(mocks.client, "7700900123", STOP, [SARAH]);
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH], conversationIds: [] }, "already_on");
      expect(result.current.leftNumber).toEqual([]);
      expect(result.current.notice).toEqual({
        kind: "scope_changed",
        diff: { newStop: false, added: [], removed: ["Sarah Jones"], cleared: false },
      });
    });
  });

  describe("a scope read served before our request committed", () => {
    it("is read again, and the late commit settles as done", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      // The verify's scope read is served while the request still waits on
      // its locks; it commits before the audit read.
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope())).mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));

      await act(async () => result.current.submit());

      expect(mocks.getNumberOptOutScope).toHaveBeenCalledTimes(3);
      expect(result.current.notice).toBeNull();
      expect(result.current.status).toBe("done");
      expect(onReenabled).toHaveBeenCalledWith(
        { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
        "done",
      );
    });

    it("the same for a number with no customer record", async () => {
      const { result, onReenabled } = await renderReady({ context: "inbox", currentHumanId: null }, scope({ records: [] }));
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope({ records: [] }))).mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ humanIds: [] })]));
      await act(async () => result.current.submit());
      expect(result.current.status).toBe("done");
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [], conversationIds: [CONVERSATION], auditId: AUDIT_ID }, "done");
    });

    it("is read again only once, and a failed second read is unconfirmed", async () => {
      const { result, onReenabled } = await renderReady();
      mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope())).mockResolvedValueOnce(fail("", null, true));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));
      await act(async () => result.current.submit());
      expect(mocks.getNumberOptOutScope).toHaveBeenCalledTimes(3);
      expect(result.current.notice).toEqual({ kind: "unconfirmed" });
      expect(result.current.canSubmit).toBe(false);
      expect(onReenabled).not.toHaveBeenCalled();
    });

    it("a read after the row is not read again", async () => {
      const { result } = await renderUnconfirmed();
      const restopped = scope({ lastStopAt: LATER_STOP, records: [{ ...scope().records[0], optedOutAt: LATER_STOP }] });
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(restopped));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow()]));
      await act(async () => result.current.reload());
      expect(mocks.getNumberOptOutScope).toHaveBeenCalledTimes(3);
      expect(result.current.notice).toEqual({ kind: "stopped_again", at: LATER_STOP });
    });
  });

  describe("a record with no switch-off time", () => {
    const legacy = { ...tom, optedOutAt: null };
    const recordsOnly = () => scope({ numberStoppedAt: null, lastStopAt: null, records: [legacy] });
    const ourLegacyRow = () => auditRow({ humanIds: [TOM], conversationIds: [] });

    it("our own late request switching it back on is done", async () => {
      const { result, onReenabled } = await renderUnconfirmed({ currentHumanId: TOM }, recordsOnly());
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([ourLegacyRow()]));
      await act(async () => result.current.reload());
      expect(mocks.listNumberReenables).toHaveBeenLastCalledWith(mocks.client, "7700900123", null, [TOM]);
      expect(result.current.status).toBe("done");
      expect(result.current.leftNumber).toEqual([]);
      expect(onReenabled).toHaveBeenCalledWith({ humanIds: [TOM], conversationIds: [], auditId: AUDIT_ID }, "done");
    });

    it("our own late request, then a STOP: it went through and is off again", async () => {
      const { result, onReenabled } = await renderUnconfirmed({ currentHumanId: TOM }, recordsOnly());
      const restopped = scope({
        numberStoppedAt: LATER_STOP,
        lastStopAt: LATER_STOP,
        records: [{ ...legacy, reason: "asked_on_whatsapp", optedOutAt: LATER_STOP }],
      });
      mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(restopped));
      mocks.listNumberReenables.mockResolvedValueOnce(ok([ourLegacyRow()]));
      await act(async () => result.current.reload());
      expect(result.current.notice).toEqual({ kind: "stopped_again", at: LATER_STOP });
      expect(onReenabled).not.toHaveBeenCalled();
    });
  });

  it("a number with no customer record that says STOP again after our late commit is not 'done'", async () => {
    // Guards `!newStop` in the done test: with no records, "every record is
    // ours" is vacuously true, so only the new STOP stops a false "done".
    const { result, onReenabled } = await renderUnconfirmed({ context: "inbox", currentHumanId: null }, scope({ records: [] }));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(
      ok(scope({ records: [], numberStoppedAt: LATER_STOP, lastStopAt: LATER_STOP })),
    );
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ humanIds: [] })]));
    await act(async () => result.current.reload());
    expect(result.current.status).toBe("ready");
    expect(result.current.notice).toEqual({ kind: "stopped_again", at: LATER_STOP });
    expect(onReenabled).not.toHaveBeenCalled();
  });

  it("with two requests in doubt, finds the later one's row by its own note", async () => {
    // Guards the newest-first search: the first dropped request was settled
    // as not applied, the note was edited, and the second dropped request landed.
    const NOTE2 = "Asked again in the salon on 15 Oct.";
    const { result, onReenabled } = await renderUnconfirmed();
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    await act(async () => result.current.reload());
    expect(result.current.notice).toEqual({ kind: "not_applied" });

    act(() => result.current.setNote(NOTE2));
    mocks.reenableNumber.mockResolvedValueOnce(fail("", null, true));
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(EMPTY));
    mocks.listNumberReenables.mockResolvedValueOnce(ok([auditRow({ permissionNote: NOTE2 })]));
    await act(async () => result.current.submit());

    expect(mocks.reenableNumber.mock.calls.map((call) => call[2])).toEqual([NOTE, NOTE2]);
    expect(result.current.status).toBe("done");
    expect(result.current.alreadyOnReason).toBeNull();
    expect(onReenabled).toHaveBeenCalledWith(
      { humanIds: [SARAH], conversationIds: [CONVERSATION], auditId: AUDIT_ID },
      "done",
    );
  });

  it("once a verify is settled, a reload is a plain load, never another verify", async () => {
    // Guards clearing `unsettled` after a settled re-read.
    const { result } = await renderUnconfirmed();
    mocks.getNumberOptOutScope.mockResolvedValueOnce(ok(scope()));
    await act(async () => result.current.reload());
    expect(result.current.notice).toEqual({ kind: "not_applied" });

    const check = deferred();
    mocks.getNumberOptOutScope.mockReturnValueOnce(check.promise);
    act(() => {
      void result.current.reload();
    });
    expect(result.current.status).toBe("loading");
    await act(async () => check.resolve(ok(scope())));
    expect(result.current.status).toBe("ready");
    expect(result.current.notice).toBeNull();
  });
});
