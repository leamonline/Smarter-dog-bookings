import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loggerError, captureException } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: loggerError },
}));
vi.mock("../../lib/sentry.js", () => ({
  captureException,
  registerChunkReloadNoiseFilter: vi.fn(),
}));

import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { handleStaleChunkError, resetChunkReloadForTests } from "../../lib/chunkReload.js";

function Throws() {
  throw new Error("database password for leam@example.com was rejected");
}

function ThrowsStaleChunk() {
  throw new TypeError("Failed to fetch dynamically imported module: /app/assets/TodayView-abc.js");
}

function ThrowsLazyShadow() {
  throw new TypeError("undefined is not an object (evaluating 'e.TodayView')");
}

const RELOAD_FLAG = "app:chunk-reload-attempted";

describe("ErrorBoundary", () => {
  let replaceSpy;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loggerError.mockClear();
    captureException.mockClear();
    sessionStorage.clear();
    resetChunkReloadForTests();
    document.getElementById("chunk-reload-notice")?.remove();
    replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "https://smarterdog.co.uk/staff/today",
        replace: replaceSpy,
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    resetChunkReloadForTests();
    document.getElementById("chunk-reload-notice")?.remove();
  });

  it("keeps exception detail out of recovery copy and reports the error once", () => {
    render(
      <ErrorBoundary>
        <Throws />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/This section couldn't be shown/i)).toBeInTheDocument();
    expect(screen.queryByText(/database password|leam@example.com/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Reference: err_/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try this section again/i })).toBeInTheDocument();
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("shows an updating notice and refreshes once on a stale-chunk import", () => {
    render(
      <ErrorBoundary>
        <ThrowsStaleChunk />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Updating to the latest version/i);
    expect(screen.getByText(/had not saved/i)).toBeInTheDocument();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("shows the recovery UI and reports when the reload loop guard refuses", () => {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    render(
      <ErrorBoundary>
        <ThrowsStaleChunk />
      </ErrorBoundary>,
    );

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/This section couldn't be shown/i)).toBeInTheDocument();
    expect(screen.queryByText(/Updating to the latest version/i)).not.toBeInTheDocument();
    expect(loggerError).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1].tags.chunkReload).toBe("loop_guard_hit");
  });

  it("does not report the lazy-mapping shadow of a reload already in flight", () => {
    handleStaleChunkError("vite:preloadError", new Error("preload"));
    captureException.mockClear();
    loggerError.mockClear();
    render(
      <ErrorBoundary>
        <ThrowsLazyShadow />
      </ErrorBoundary>,
    );

    expect(loggerError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Updating to the latest version/i);
  });
});
