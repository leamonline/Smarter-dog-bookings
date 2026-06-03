import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Avoid initialising a real Supabase client at import time. The hint under
// test renders independently of the get_open_days fetch, so a null client
// (the component's own `if (!supabase) return` guard) is enough.
vi.mock("../../../supabase/customerClient.js", () => ({ customerSupabase: null }));

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

  it("explains that closed days are dimmed", () => {
    expect(renderHint()).toMatch(/dimmed/i);
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
