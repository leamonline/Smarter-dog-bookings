import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loggerError, captureException } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: loggerError },
}));
vi.mock("../../lib/sentry.js", () => ({ captureException }));

import { ErrorBoundary } from "./ErrorBoundary.jsx";

function Throws() {
  throw new Error("database password for leam@example.com was rejected");
}

function ThrowsStaleChunk() {
  throw new TypeError("Failed to fetch dynamically imported module: /assets/TodayView-abc.js");
}

function ThrowsLazyShadow() {
  throw new TypeError("undefined is not an object (evaluating 'e.TodayView')");
}

const RELOAD_FLAG = "app:chunk-reload-attempted";

describe("ErrorBoundary", () => {
  let reloadSpy;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loggerError.mockClear();
    captureException.mockClear();
    sessionStorage.clear();
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadSpy },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("keeps exception detail out of recovery copy and reports the error once", () => {
    render(
      <ErrorBoundary>
        <Throws />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/We couldn't load this part of the dashboard/i)).toBeInTheDocument();
    expect(screen.queryByText(/database password|leam@example.com/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Reference: err_/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Give it another go/i })).toBeInTheDocument();
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("auto-reloads once on a stale-chunk import instead of reporting it", () => {
    render(
      <ErrorBoundary>
        <ThrowsStaleChunk />
      </ErrorBoundary>,
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1].tags).toMatchObject({
      chunkReload: "reloading",
      source: "error-boundary",
    });
  });

  it("shows the recovery UI and reports when the reload loop guard refuses", () => {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    render(
      <ErrorBoundary>
        <ThrowsStaleChunk />
      </ErrorBoundary>,
    );

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/We couldn't load this part of the dashboard/i)).toBeInTheDocument();
  });

  it("does not report the lazy-mapping shadow of a reload already in flight", () => {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    render(
      <ErrorBoundary>
        <ThrowsLazyShadow />
      </ErrorBoundary>,
    );

    expect(loggerError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
