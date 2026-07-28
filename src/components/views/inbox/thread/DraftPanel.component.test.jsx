import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftPanel } from "./DraftPanel.jsx";

const draft = {
  id: "draft-1",
  proposed_text: "Shall I book Bella in for Tuesday at 10?",
  intent: "booking_propose",
  confidence: 0.92,
  risk_level: "medium",
  handoff_required: false,
  auto_send_eligible: false,
  model: "test-model",
};

describe("DraftPanel booking-action guard", () => {
  it("withholds reply controls until every attached booking action is resolved", () => {
    render(
      <DraftPanel
        draft={draft}
        attachedActions={[
          {
            id: "action-1",
            payload: {
              dog_name: "Bella",
              booking_date: "2026-08-04",
              slot: "10:00",
            },
          },
        ]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        inFlight={false}
      />,
    );

    expect(
      screen.getByRole("note", { name: "Safe booking and reply order" }),
    ).toHaveTextContent(
      "Apply or reject the booking below first. Check the diary, then come back here to send this reply.",
    );
    expect(
      screen.queryByRole("button", { name: /send|apply/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject draft" })).toBeEnabled();
  });

  it("keeps the usual reply controls when no booking action is attached", () => {
    render(
      <DraftPanel
        draft={draft}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        inFlight={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Approve & send" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit first" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });
});
