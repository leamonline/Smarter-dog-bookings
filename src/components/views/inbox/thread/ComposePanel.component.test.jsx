import { useState } from "react";
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

function ControlledComposePanel(props) {
  const [value, setValue] = useState(props.initialValue ?? "");
  return (
    <ComposePanel
      conversation={openWindowConversation()}
      dogNames={[]}
      inFlight={false}
      onSendTemplate={vi.fn()}
      {...props}
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        props.onChange?.(nextValue);
      }}
    />
  );
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
        value=""
        onChange={vi.fn()}
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
      <ControlledComposePanel
        onSend={vi.fn()}
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

  it("types the AI suggestion into the compose box without sending", async () => {
    const onSend = vi.fn();
    const onGenerateReply = vi
      .fn()
      .mockResolvedValue({ ok: true, replyText: "Hi Sarah 🐾 — happy to help!" });

    render(
      <ControlledComposePanel
        onSend={onSend}
        hasInbound
        hasPendingDraft={false}
        onGenerateReply={onGenerateReply}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /generate reply/i }));
    });

    // The suggestion lands in the textarea, ready for the human to edit.
    expect(screen.getByPlaceholderText("Write a reply…")).toHaveValue(
      "Hi Sarah 🐾 — happy to help!",
    );
    // It must NOT send — sending is the human's job.
    expect(onSend).not.toHaveBeenCalled();
  });

  it("hides Generate reply when a draft is pending or there is no inbound yet", () => {
    const { rerender } = render(
      <ComposePanel
        conversation={openWindowConversation()}
        dogNames={[]}
        inFlight={false}
        value=""
        onChange={vi.fn()}
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
        value=""
        onChange={vi.fn()}
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

  it("keeps Enter to send and Shift+Enter for newline", () => {
    const onSend = vi.fn();
    const onChange = vi.fn();

    render(
      <ComposePanel
        conversation={openWindowConversation()}
        value="Hello"
        onChange={onChange}
        onSend={onSend}
        onSendTemplate={vi.fn()}
        dogNames={[]}
        inFlight={false}
      />,
    );

    const textarea = screen.getByLabelText("Write a reply");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith({ text: "Hello" });
  });

  it("grows from one to five lines before enabling internal scrolling", () => {
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => ({
      ...originalGetComputedStyle(element),
      lineHeight: "20px",
      paddingTop: "8px",
      paddingBottom: "8px",
      borderTopWidth: "1px",
      borderBottomWidth: "1px",
    }));

    render(<ControlledComposePanel onSend={vi.fn()} />);
    const textarea = screen.getByLabelText("Write a reply");
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 140,
    });

    fireEvent.change(textarea, { target: { value: "One\nTwo\nThree\nFour\nFive\nSix" } });

    expect(textarea.style.height).toBe("118px");
    expect(textarea.style.overflowY).toBe("auto");
  });
});
