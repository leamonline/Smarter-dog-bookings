// Component test for the mobile/tablet workflow strip. The heavy
// children (UtilityTabs + DeliveryFailuresCard) self-fetch via data
// hooks, so we stub them and exercise the strip's own job: surface the
// pending counts in an accessible summary, gate the tabs behind the
// expand, and always show the delivery-failures card when there are any.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("./UtilityTabs.jsx", () => ({
  UtilityTabs: () => <div data-testid="utility-tabs" />,
}));
vi.mock("./DeliveryFailuresCard.jsx", () => ({
  DeliveryFailuresCard: () => <div data-testid="delivery-failures" />,
}));

import { WorkflowStatusStrip } from "./WorkflowStatusStrip.jsx";

function renderStrip(props = {}) {
  return render(
    <WorkflowStatusStrip
      failures={{ count: 0, failures: [] }}
      messageCount={0}
      reminderCount={0}
      waitlistCount={0}
      todoCount={0}
      {...props}
    />,
  );
}

const toggle = () => screen.getByRole("button", { name: /workflow panel/i });

describe("WorkflowStatusStrip", () => {
  it("is collapsed by default and does not mount the tabs", () => {
    renderStrip({ messageCount: 3, reminderCount: 5, todoCount: 2 });
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("utility-tabs")).not.toBeInTheDocument();
  });

  it("summarises the pending counts in the button's accessible name", () => {
    renderStrip({ messageCount: 3, reminderCount: 1, waitlistCount: 0, todoCount: 2 });
    const name = toggle().getAttribute("aria-label");
    expect(name).toMatch(/3 unread messages/i);
    expect(name).toMatch(/1 reminder to send/i); // singular
    expect(name).toMatch(/2 open tasks/i);
    expect(name).not.toMatch(/waitlist/i); // zero counts are omitted
  });

  it("reads 'all clear' when nothing is pending", () => {
    renderStrip();
    expect(toggle().getAttribute("aria-label")).toMatch(/all clear/i);
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
  });

  it("expands to reveal the tabs on click", async () => {
    const user = userEvent.setup();
    renderStrip({ messageCount: 1 });
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("utility-tabs")).toBeInTheDocument();
  });

  it("always shows the delivery-failures card when there are any, even collapsed", () => {
    renderStrip({ failures: { count: 1, failures: [{}] } });
    expect(screen.getByTestId("delivery-failures")).toBeInTheDocument();
    expect(screen.queryByTestId("utility-tabs")).not.toBeInTheDocument(); // still collapsed
    expect(toggle().getAttribute("aria-label")).toMatch(/1 delivery issue/i);
  });
});
