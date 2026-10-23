import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPostHogConfig,
  DEFAULT_POSTHOG_HOST,
  isAnalyticsEnabled,
  mirrorIfLogged,
  resetAnalyticsForTests,
  scrubEvent,
  scrubUrl,
  trackFunnelStep,
  type AnalyticsEnv,
} from "./analytics";

const LIVE: AnalyticsEnv = { key: "phc_test", prod: true };
const UUID = "3f2b8c1e-9a4d-4e2f-8b1c-0d9e8f7a6b5c";

function fakePostHog() {
  return { init: vi.fn(), capture: vi.fn() };
}

// trackFunnelStep resolves its client asynchronously; let the chain settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => resetAnalyticsForTests());

describe("isAnalyticsEnabled", () => {
  it("needs a key, a production build and an online app", () => {
    expect(isAnalyticsEnabled(LIVE)).toBe(true);
    expect(isAnalyticsEnabled({ ...LIVE, key: undefined })).toBe(false);
    expect(isAnalyticsEnabled({ ...LIVE, key: "" })).toBe(false);
    expect(isAnalyticsEnabled({ ...LIVE, prod: false })).toBe(false);
    expect(isAnalyticsEnabled({ ...LIVE, forceOffline: "1" })).toBe(false);
  });

  it("is off in the test run's own environment", () => {
    expect(isAnalyticsEnabled()).toBe(false);
  });
});

describe("buildPostHogConfig", () => {
  it("stores nothing on the device and collects only named events", () => {
    const config = buildPostHogConfig(DEFAULT_POSTHOG_HOST);
    expect(config).toMatchObject({
      api_host: "https://eu.i.posthog.com",
      persistence: "memory",
      person_profiles: "never",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      save_campaign_params: false,
      mask_personal_data_properties: true,
    });
    expect(config).not.toHaveProperty("bootstrap");
  });

  it("seeds the distinct id with the funnel attempt when given one", () => {
    expect(buildPostHogConfig(DEFAULT_POSTHOG_HOST, "attempt-1")).toMatchObject({
      bootstrap: { distinctID: "attempt-1" },
    });
  });
});

describe("scrubUrl", () => {
  it("keeps origin and path, drops query and hash, blanks UUIDs", () => {
    expect(scrubUrl(`https://smarterdog.co.uk/book/bookings/${UUID}?token=abc#x`)).toBe(
      "https://smarterdog.co.uk/book/bookings/:id",
    );
  });

  it("handles relative paths and non-strings", () => {
    expect(scrubUrl(`/book/${UUID}?a=1`)).toBe("/book/:id");
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});

describe("scrubEvent", () => {
  it("scrubs URLs, drops full referrers and person updates, keeps the referring domain", () => {
    const event = scrubEvent({
      properties: {
        $current_url: "https://smarterdog.co.uk/book?magic=secret",
        $referrer: "https://mail.example.com/?token=secret",
        $initial_referrer: "https://mail.example.com/?token=secret",
        $referring_domain: "mail.example.com",
        step: "started",
      },
      $set: { email: "someone@example.com" },
      $set_once: { phone: "07700900000" },
    });
    expect(event.properties).toEqual({
      $current_url: "https://smarterdog.co.uk/book",
      $referring_domain: "mail.example.com",
      step: "started",
    });
    expect(event).not.toHaveProperty("$set");
    expect(event).not.toHaveProperty("$set_once");
  });

  it("scrubs URL-shaped keys it was never told about, like the session-entry set", () => {
    const event = scrubEvent({
      properties: {
        $session_entry_url: `https://smarterdog.co.uk/book?reschedule=${UUID}`,
        $session_entry_pathname: `/book/bookings/${UUID}`,
        $session_entry_referrer: "https://mail.example.com/?token=secret",
        $session_entry_referring_domain: "mail.example.com",
        $session_entry_gclid: "click-123",
        fbclid: "click-456",
        utm_source: "newsletter",
        landing: "https://smarterdog.co.uk/book?token=secret",
      },
    });
    expect(event.properties).toEqual({
      $session_entry_url: "https://smarterdog.co.uk/book",
      $session_entry_pathname: "/book/bookings/:id",
      $session_entry_referring_domain: "mail.example.com",
      utm_source: "newsletter",
      landing: "https://smarterdog.co.uk/book",
    });
  });

  it("passes null through", () => {
    expect(scrubEvent(null)).toBeNull();
  });
});

describe("mirrorIfLogged", () => {
  const event = { sessionId: "m1", step: "started", stepIndex: 0, dogCount: null };

  it("sends only when the database write succeeded", async () => {
    const posthog = fakePostHog();
    const load = async () => posthog;
    mirrorIfLogged({ error: { message: "rls" } }, event, LIVE, load);
    mirrorIfLogged(null, event, LIVE, load);
    mirrorIfLogged(undefined, event, LIVE, load);
    await settle();
    expect(posthog.capture).not.toHaveBeenCalled();

    mirrorIfLogged({ error: null }, event, LIVE, load);
    await settle();
    expect(posthog.capture).toHaveBeenCalledTimes(1);
  });
});

describe("trackFunnelStep", () => {
  it("initialises once and sends only the funnel fields", async () => {
    const posthog = fakePostHog();
    const load = vi.fn(async () => posthog);

    trackFunnelStep({ sessionId: "s1", step: "started", stepIndex: 0, dogCount: null }, LIVE, load);
    trackFunnelStep(
      { sessionId: "s1", step: "select_dogs", stepIndex: 1, dogCount: 2, blockedReason: undefined },
      LIVE,
      load,
    );
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init.mock.calls[0][0]).toBe("phc_test");
    expect(posthog.init.mock.calls[0][1]).toMatchObject({ bootstrap: { distinctID: "s1" } });
    expect(posthog.capture).toHaveBeenNthCalledWith(1, "booking_funnel_step", {
      funnel_session_id: "s1",
      step: "started",
      step_index: 0,
      dog_count: null,
    });
    expect(posthog.capture).toHaveBeenNthCalledWith(2, "booking_funnel_step", {
      funnel_session_id: "s1",
      step: "select_dogs",
      step_index: 1,
      dog_count: 2,
    });
  });

  it("carries blocked and failure codes", async () => {
    const posthog = fakePostHog();
    trackFunnelStep(
      { sessionId: "s2", step: "confirm_failed", stepIndex: 5, dogCount: 1, failureCode: "capacity_full" },
      LIVE,
      async () => posthog,
    );
    await settle();
    expect(posthog.capture).toHaveBeenCalledWith(
      "booking_funnel_step",
      expect.objectContaining({ step: "confirm_failed", failure_code: "capacity_full" }),
    );
  });

  it("does nothing at all when disabled", async () => {
    const load = vi.fn(async () => fakePostHog());
    trackFunnelStep({ sessionId: "s3", step: "started", stepIndex: 0, dogCount: null }, { prod: true }, load);
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("never throws when loading or capturing fails", async () => {
    expect(() =>
      trackFunnelStep({ sessionId: "s4", step: "started", stepIndex: 0, dogCount: null }, LIVE, async () => {
        throw new Error("blocked by an ad blocker");
      }),
    ).not.toThrow();
    await settle();

    resetAnalyticsForTests();
    const posthog = fakePostHog();
    posthog.capture.mockImplementation(() => {
      throw new Error("capture exploded");
    });
    trackFunnelStep({ sessionId: "s5", step: "started", stepIndex: 0, dogCount: null }, LIVE, async () => posthog);
    await settle();
    expect(posthog.capture).toHaveBeenCalled();
  });
});
