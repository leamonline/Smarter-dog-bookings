import { describe, expect, it } from "vitest";

import {
  buildFlowMetaBody,
  FLOW_CTA_MAX,
  type FlowMessageParams,
  validateFlowMessageParams,
} from "../../../supabase/functions/_shared/flowMessage.ts";

const base: FlowMessageParams = {
  toDigits: "447700900123",
  flowId: "1234567890",
  flowToken: "tok-abc",
  bodyText: "Tap below to book your dog's groom.",
  ctaLabel: "Book appointment",
  initialScreen: "WELCOME",
  initialData: { greeting: "Hi Sam", intro: "Let's book." },
};

describe("buildFlowMetaBody", () => {
  it("builds a navigate-mode interactive flow message", () => {
    const body = buildFlowMetaBody(base) as Record<string, any>;
    expect(body.type).toBe("interactive");
    expect(body.interactive.type).toBe("flow");
    const params = body.interactive.action.parameters;
    expect(params.flow_message_version).toBe("3");
    expect(params.flow_id).toBe("1234567890");
    expect(params.flow_token).toBe("tok-abc");
    expect(params.flow_action).toBe("navigate");
    expect(params.flow_action_payload).toEqual({
      screen: "WELCOME",
      data: { greeting: "Hi Sam", intro: "Let's book." },
    });
    // Published is the default — no explicit mode field.
    expect(params.mode).toBeUndefined();
  });

  it("includes mode only when draft", () => {
    const body = buildFlowMetaBody({ ...base, mode: "draft" }) as Record<string, any>;
    expect(body.interactive.action.parameters.mode).toBe("draft");
  });

  it("truncates an over-long CTA to Meta's limit", () => {
    const body = buildFlowMetaBody({ ...base, ctaLabel: "x".repeat(50) }) as Record<string, any>;
    expect(body.interactive.action.parameters.flow_cta.length).toBe(FLOW_CTA_MAX);
  });

  it("omits header/footer unless provided", () => {
    const body = buildFlowMetaBody(base) as Record<string, any>;
    expect(body.interactive.header).toBeUndefined();
    expect(body.interactive.footer).toBeUndefined();
    const withHeader = buildFlowMetaBody({ ...base, headerText: "Smarter Dog" }) as Record<string, any>;
    expect(withHeader.interactive.header).toEqual({ type: "text", text: "Smarter Dog" });
  });
});

describe("validateFlowMessageParams", () => {
  it("passes a complete param set", () => {
    expect(validateFlowMessageParams(base)).toEqual({ ok: true });
  });

  it("reports the first missing field", () => {
    expect(validateFlowMessageParams({ ...base, flowId: "" })).toEqual({
      ok: false,
      reason: "flowId is required",
    });
  });
});
