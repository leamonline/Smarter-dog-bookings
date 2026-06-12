import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ComposePanel } from "./ComposePanel.jsx";

describe("ComposePanel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-checks the WhatsApp free-form window while the thread stays open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T09:00:00Z"));

    render(
      <ComposePanel
        conversation={{
          id: "conv-1",
          last_inbound_at: "2026-06-11T09:01:00Z",
          humans: { name: "Sarah" },
        }}
        dogNames={["Bella"]}
        inFlight={false}
        onSend={vi.fn()}
        onSendTemplate={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Write a reply…")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    expect(
      screen.getByText("24-hour reply window closed"),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Write a reply…")).not.toBeInTheDocument();
  });
});
