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

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
