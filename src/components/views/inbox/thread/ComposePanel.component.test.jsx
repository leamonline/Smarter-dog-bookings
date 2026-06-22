import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ComposePanel } from "./ComposePanel.jsx";

// last_inbound an hour before "now" keeps the 24h free-form window open
// against the real clock, so the textarea + compose-row controls render.
function openWindowConversation(overrides = {}) {
  return {
    id: "conv-1",
    last_inbound_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    humans: { name: "Sarah" },
    ...overrides,
  };
}

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
      screen.getByText(/24-hour reply window closed/i),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Write a reply…")).not.toBeInTheDocument();
  });

  it("offers Generate reply inside the compose row and fires it on click", async () => {
    const onGenerateReply = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ComposePanel
        conversation={openWindowConversation()}
        dogNames={[]}
        inFlight={false}
        onSend={vi.fn()}
        onSendTemplate={vi.fn()}
        hasInbound
        hasPendingDraft={false}
        onGenerateReply={onGenerateReply}
      />,
    );

    const generate = screen.getByRole("button", { name: /generate reply/i });
    expect(generate).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(generate);
    });

    expect(onGenerateReply).toHaveBeenCalledTimes(1);
  });

  it("hides Generate reply when a draft is pending or there is no inbound yet", () => {
    const { rerender } = render(
      <ComposePanel
        conversation={openWindowConversation()}
        dogNames={[]}
        inFlight={false}
        onSend={vi.fn()}
        onSendTemplate={vi.fn()}
        hasInbound
        hasPendingDraft
        onGenerateReply={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /generate reply/i }),
    ).not.toBeInTheDocument();

    rerender(
      <ComposePanel
        conversation={openWindowConversation()}
        dogNames={[]}
        inFlight={false}
        onSend={vi.fn()}
        onSendTemplate={vi.fn()}
        hasInbound={false}
        hasPendingDraft={false}
        onGenerateReply={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /generate reply/i }),
    ).not.toBeInTheDocument();
  });
});
