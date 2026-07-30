import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockOutbound = value;
}

vi.mock("../../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockOutbound;
  },
}));

const { useOutboundSender } = await import("./useOutboundSender.js");

function makeStub({ invokeResult = { error: null } } = {}) {
  return {
    functions: {
      invoke: vi.fn(() => Promise.resolve(invokeResult)),
    },
  };
}

describe("useOutboundSender", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sendOutboundSMS rejects missing recipient up front", async () => {
    setSupabase(makeStub());
    const refreshList = vi.fn();
    const { result } = renderHook(() => useOutboundSender({ refreshList }));

    let res;
    await act(async () => {
      res = await result.current.sendOutboundSMS({
        phoneE164: "",
        text: "hi",
      });
    });
    expect(res).toEqual({ ok: false, reason: "missing recipient or text" });
    expect(refreshList).not.toHaveBeenCalled();
  });

  it("sendOutboundSMS posts to sms-send and refreshes the list on success", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const refreshList = vi.fn();
    const { result } = renderHook(() => useOutboundSender({ refreshList }));

    let res;
    await act(async () => {
      res = await result.current.sendOutboundSMS({
        humanId: "h1",
        phoneE164: "+447700900111",
        text: "Hi Sarah",
      });
    });

    expect(res).toEqual({ ok: true });
    expect(stub.functions.invoke).toHaveBeenCalledWith("sms-send", {
      body: {
        mode: "manual",
        to: "+447700900111",
        text: "Hi Sarah",
        human_id: "h1",
      },
    });
    expect(refreshList).toHaveBeenCalledTimes(1);
  });

  it("sendOutboundSMS surfaces the function error's structured detail", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: {
        json: () => Promise.resolve({ error: "twilio_rate_limited", detail: "try later" }),
      },
    };
    setSupabase(makeStub({ invokeResult: { error } }));
    const refreshList = vi.fn();
    const { result } = renderHook(() => useOutboundSender({ refreshList }));

    let res;
    await act(async () => {
      res = await result.current.sendOutboundSMS({
        phoneE164: "+447700900111",
        text: "hi",
      });
    });
    expect(res).toEqual({
      ok: false,
      reason: "twilio_rate_limited: try later",
    });
    expect(refreshList).not.toHaveBeenCalled();
  });

  it("sendOutboundTemplate rejects when template is missing", async () => {
    setSupabase(makeStub());
    const refreshList = vi.fn();
    const { result } = renderHook(() => useOutboundSender({ refreshList }));

    let res;
    await act(async () => {
      res = await result.current.sendOutboundTemplate({
        humanId: "h1",
        phoneE164: "+447700900111",
        template: null,
      });
    });
    expect(res).toEqual({
      ok: false,
      reason: "missing recipient or template",
    });
  });

  it("sendOutboundTemplate posts to whatsapp-send with template params and refreshes on success", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const refreshList = vi.fn();
    const { result } = renderHook(() => useOutboundSender({ refreshList }));

    let res;
    await act(async () => {
      res = await result.current.sendOutboundTemplate({
        humanId: "h1",
        phoneE164: "+447700900111",
        template: {
          name: "booking_reminder",
          language: "en_GB",
          // Minimal shape buildTemplateParams accepts; the test
          // doesn't care about the exact param mapping.
          params: [],
        },
        paramValues: {},
      });
    });

    expect(res).toEqual({ ok: true });
    expect(stub.functions.invoke).toHaveBeenCalledWith(
      "whatsapp-send",
      expect.objectContaining({
        body: expect.objectContaining({
          mode: "template",
          to: "+447700900111",
          template_name: "booking_reminder",
          language: "en_GB",
          human_id: "h1",
        }),
      }),
    );
    expect(refreshList).toHaveBeenCalledTimes(1);
  });
});
