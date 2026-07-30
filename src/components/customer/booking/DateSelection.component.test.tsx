import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Avoid initialising a real Supabase client at import time. A null client is
// deliberately incomplete, so this fixture exercises the truthful degraded
// hint rather than pretending closure and capacity reads succeeded.
vi.mock("../../../supabase/customerClient", () => ({ customerSupabase: null }));

import { DateSelection } from "./DateSelection";

describe("DateSelection calendar hint", () => {
  const noop = () => {};

  function renderHint(): string {
    const { container } = render(
      <DateSelection
        selectedDate={null}
        onSelect={noop}
        onNext={noop}
        onBack={noop}
      />,
    );
    return container.querySelector(".wizard-calendar-hint")?.textContent ?? "";
  }

  it("does not claim complete dimming when availability could not be read", () => {
    const hint = renderHint();
    expect(hint).toMatch(/preview is incomplete/i);
    expect(hint).toMatch(/next step/i);
    expect(hint).not.toMatch(/dimmed/i);
  });

  // Regression guard: the hint must NOT make a static claim about which
  // weekdays the salon is open. That claim was derived from a constant and
  // could contradict the live get_open_days closures driving the dimming.
  it("does not hardcode which weekdays the salon is open", () => {
    const hint = renderHint();
    expect(hint).not.toMatch(/we'?re open/i);
    expect(hint).not.toMatch(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    );
  });
});
