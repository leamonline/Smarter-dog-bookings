import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ init: vi.fn(), setTag: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/react", () => sentry);

async function freshModule() {
  vi.resetModules();
  return import("./sentry.js");
}

describe("Sentry release and mount tags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sentry.init.mockClear();
    sentry.setTag.mockClear();
  });

  it("tags events with the build's release", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://key@example.ingest.sentry.io/1");
    vi.stubEnv("VITE_SENTRY_RELEASE", "abc1234");
    const { initSentry } = await freshModule();
    initSentry();
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ release: "abc1234" }));
  });

  it("sends no release rather than an empty one", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://key@example.ingest.sentry.io/1");
    vi.stubEnv("VITE_SENTRY_RELEASE", "");
    const { initSentry } = await freshModule();
    initSentry();
    expect(sentry.init.mock.calls[0][0].release).toBeUndefined();
  });

  it("tags the mount only once Sentry is running", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://key@example.ingest.sentry.io/1");
    const { initSentry, tagMount } = await freshModule();
    tagMount("staff");
    expect(sentry.setTag).not.toHaveBeenCalled();
    initSentry();
    tagMount("customer");
    expect(sentry.setTag).toHaveBeenCalledWith("mount", "customer");
  });

  it("does nothing at all without a DSN", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    const { initSentry, tagMount } = await freshModule();
    initSentry();
    tagMount("staff");
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.setTag).not.toHaveBeenCalled();
  });
});
