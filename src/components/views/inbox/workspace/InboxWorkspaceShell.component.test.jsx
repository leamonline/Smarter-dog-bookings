import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboxWorkspaceShell } from "./InboxWorkspaceShell.jsx";

function renderShell(overrides = {}) {
  const props = {
    rootRef: createRef(),
    fillHeight: 640,
    mobilePane: "list",
    contextOpen: false,
    contextSection: "customer",
    conversationPane: <div>List content</div>,
    threadPane: <div>Thread content</div>,
    contextPane: <div>Context content</div>,
    onPaneBack: vi.fn(),
    onDismissContext: vi.fn(),
    returnFocusRef: { current: null },
    ...overrides,
  };
  return { ...render(<InboxWorkspaceShell {...props} />), props };
}

describe("InboxWorkspaceShell", () => {
  it("keeps three named scrolling regions mounted across pane changes", () => {
    const { props, rerender } = renderShell();
    const conversations = screen.getByRole("region", { name: "Conversations" });
    const thread = screen.getByRole("region", { name: "Message thread" });
    const context = screen.getByRole("region", { name: "Booking and customer context" });

    for (const region of [conversations, thread, context]) {
      expect(region.className).toContain("min-h-0");
      expect(region.className).toContain("overscroll-contain");
    }
    expect(conversations.className).toContain("overflow-y-auto");
    // The thread owns its message and draft scrollers; its frame must not scroll.
    expect(thread.className).toContain("overflow-hidden");
    // The context frame does not: its pane pins section headers and scrolls
    // only the open body, so a second scroller here would double up.
    expect(context.className).toContain("overflow-hidden");
    expect(context.className).not.toContain("overflow-y-auto");

    rerender(<InboxWorkspaceShell {...props} mobilePane="context" contextOpen />);
    expect(screen.getByRole("region", { name: "Conversations" })).toBe(conversations);
    expect(screen.getByRole("region", { name: "Message thread" })).toBe(thread);
    expect(screen.getByRole("region", { name: "Booking and customer context" })).toBe(context);
  });

  it("applies the approved height, grid, overlay widths and reduced-motion contract", () => {
    const { props } = renderShell({ contextOpen: true });
    const root = props.rootRef.current;
    const grid = root.firstElementChild;
    const context = screen.getByRole("region", { name: "Booking and customer context" });

    expect(root.style.getPropertyValue("--fill-visible-height")).toBe("640px");
    expect(root.className).toContain(
      "h-[var(--fill-visible-height,calc(100dvh-var(--fill-top)-var(--fill-bottom-gap)))]",
    );
    expect(root.className).toContain("min-h-[360px]");
    expect(root.className).toContain("overflow-hidden");
    expect(grid.className).toContain("md:grid-cols-[280px_minmax(0,1fr)]");
    expect(grid.className).toContain("lg:grid-cols-[300px_minmax(0,1fr)]");
    expect(grid.className).toContain(
      "wide:grid-cols-[300px_minmax(560px,1fr)_360px]",
    );
    expect(context.className).toContain("md:w-[min(520px,100%)]");
    expect(context.className).toContain("lg:w-[380px]");
    expect(context.className).toContain("wide:w-auto");
    expect(context.className).toContain("motion-reduce:transition-none");
    expect(context.className).toContain("motion-reduce:duration-0");
  });

  it("lets a keyboard-constrained measured height override the normal minimum", () => {
    const { props } = renderShell({ fillHeight: 250 });
    const root = props.rootRef.current;

    expect(root.style.getPropertyValue("--fill-visible-height")).toBe("250px");
    expect(root.className).toContain("min-h-0");
    expect(root.className).not.toContain("min-h-[360px]");
  });

  it("dismisses a context overlay with Escape and restores its trigger", () => {
    const triggerRef = { current: document.createElement("button") };
    document.body.appendChild(triggerRef.current);
    const onDismissContext = vi.fn();
    renderShell({
      contextOpen: true,
      contextSection: "booking",
      mobilePane: "context",
      returnFocusRef: triggerRef,
      onDismissContext,
    });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismissContext).toHaveBeenCalledTimes(1);
    expect(triggerRef.current).toHaveFocus();
    triggerRef.current.remove();
  });

  it("uses a button scrim to dismiss the context and restore focus", () => {
    const triggerRef = { current: document.createElement("button") };
    document.body.appendChild(triggerRef.current);
    const onDismissContext = vi.fn();
    renderShell({ contextOpen: true, returnFocusRef: triggerRef, onDismissContext });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss booking and customer context" }));

    expect(onDismissContext).toHaveBeenCalledTimes(1);
    expect(triggerRef.current).toHaveFocus();
    triggerRef.current.remove();
  });

  it("routes explicit mobile Back controls through one callback", () => {
    const onPaneBack = vi.fn();
    const { props, rerender } = renderShell({ mobilePane: "thread", onPaneBack });

    expect(screen.queryByRole("button", { name: "Back to conversations" })).not.toBeInTheDocument();

    rerender(
      <InboxWorkspaceShell
        {...props}
        mobilePane="context"
        contextOpen
        contextSection="booking"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to message thread" }));
    expect(onPaneBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Booking")).toBeInTheDocument();
  });

  it("does not dismiss or render a scrim when context is closed", () => {
    const onDismissContext = vi.fn();
    renderShell({ contextOpen: false, onDismissContext });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismissContext).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Dismiss booking and customer context" }),
    ).not.toBeInTheDocument();
  });
});
