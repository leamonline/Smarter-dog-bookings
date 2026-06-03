import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";

// Green is reserved for success/confirmed. The shared Badge "success" tone is
// the keystone: switching it here propagates brand-green everywhere success
// badges are used. Guard against emerald creeping back in.
describe("Badge success tone uses brand-green, not emerald", () => {
  it.each(["soft", "solid", "outline"])("%s variant", (variant) => {
    const { container } = render(
      <Badge tone="success" variant={variant}>
        OK
      </Badge>,
    );
    const cls = container.firstChild.className;
    expect(cls).not.toMatch(/emerald/);
    expect(cls).toMatch(/brand-green/);
  });
});
