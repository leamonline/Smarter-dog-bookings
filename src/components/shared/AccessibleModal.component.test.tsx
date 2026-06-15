import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AccessibleModal } from "./AccessibleModal";

afterEach(() => {
  // Guard against a leaked scroll lock between tests.
  document.body.style.overflow = "";
});

describe("AccessibleModal", () => {
  it("portals to document.body so it escapes a transformed ancestor", () => {
    // A transformed ancestor (like the customer portal's animated cards)
    // would otherwise trap a position:fixed overlay inside the card.
    const { container } = render(
      <div style={{ transform: "translateY(0)" }}>
        <AccessibleModal onClose={() => {}} titleId="t">
          <h2 id="t">Hello</h2>
        </AccessibleModal>
      </div>,
    );

    // The dialog is NOT inside the transformed render container…
    expect(container.querySelector('[aria-modal="true"]')).toBeNull();
    // …it's portaled out to document.body instead.
    const dialog = document.body.querySelector('[aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.contains(dialog)).toBe(false);
  });

  it("locks body scroll while open and restores it on close (no leak)", () => {
    const { unmount } = render(
      <AccessibleModal onClose={() => {}}>
        <p>content</p>
      </AccessibleModal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the lock until the LAST stacked modal closes", () => {
    const a = render(
      <AccessibleModal onClose={() => {}}>
        <p>a</p>
      </AccessibleModal>,
    );
    const b = render(
      <AccessibleModal onClose={() => {}}>
        <p>b</p>
      </AccessibleModal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    a.unmount();
    // Still one modal open — must stay locked.
    expect(document.body.style.overflow).toBe("hidden");
    b.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <AccessibleModal onClose={onClose} titleId="t2">
        <h2 id="t2">Body</h2>
      </AccessibleModal>,
    );
    // The backdrop is the fixed inset-0 overlay wrapping the dialog.
    const backdrop = document.body.querySelector('[class*="inset-0"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
