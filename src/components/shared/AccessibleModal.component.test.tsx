import { render, fireEvent } from "@testing-library/react";
import { OverlayProvider } from "react-aria";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AccessibleModal } from "./AccessibleModal";

afterEach(() => {
  // Guard against a leaked scroll lock between tests.
  document.body.style.overflow = "";
});

describe("AccessibleModal", () => {
  it("hides the application from assistive technology while a modal is open", () => {
    const view = render(
      <OverlayProvider>
        <main data-testid="application">Application content</main>
        <AccessibleModal onClose={() => {}} titleId="isolation-title">
          <h2 id="isolation-title">Modal content</h2>
        </AccessibleModal>
      </OverlayProvider>,
    );

    const application = view.getByTestId("application");
    const hiddenAncestor = application.closest('[aria-hidden="true"]');
    expect(hiddenAncestor).not.toBeNull();
    expect(
      view.getByRole("dialog", { name: "Modal content" }),
    ).toBeInTheDocument();
  });

  it("does not hide the application for a non-modal drawer", () => {
    const view = render(
      <OverlayProvider>
        <main data-testid="application">Application content</main>
        <AccessibleModal
          modal={false}
          onClose={() => {}}
          titleId="drawer-title"
        >
          <h2 id="drawer-title">Drawer content</h2>
        </AccessibleModal>
      </OverlayProvider>,
    );

    expect(
      view.getByTestId("application").closest('[aria-hidden="true"]'),
    ).toBeNull();
  });

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
    // …it's portaled out to React Aria's body-level overlay container instead.
    const dialog = document.body.querySelector('[aria-modal="true"]');
    expect(dialog).not.toBeNull();
    const overlayContainer = dialog?.closest("[data-overlay-container]");
    expect(overlayContainer).not.toBeNull();
    expect(overlayContainer?.parentElement).toBe(document.body);
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

describe("AccessibleModal — non-modal mode (modal={false})", () => {
  it("renders a dialog without aria-modal, scroll lock, or a blocking backdrop", () => {
    render(
      <AccessibleModal onClose={() => {}} titleId="nm" modal={false}>
        <h2 id="nm">Panel</h2>
      </AccessibleModal>,
    );
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    // Page behind must stay scrollable…
    expect(document.body.style.overflow).toBe("");
    // …and the full-screen wrapper must not swallow clicks.
    const overlay = document.body.querySelector('[class*="inset-0"]') as HTMLElement;
    expect(overlay.className).toContain("pointer-events-none");
    // The panel itself re-enables pointer events.
    expect(dialog.className).toContain("pointer-events-auto");
  });

  it("still closes on Escape, but not on an overlay click", () => {
    const onClose = vi.fn();
    render(
      <AccessibleModal onClose={onClose} titleId="nm2" modal={false}>
        <h2 id="nm2">Panel</h2>
      </AccessibleModal>,
    );
    const overlay = document.body.querySelector('[class*="inset-0"]') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AccessibleModal — stacked dialogs", () => {
  it("Escape only closes the topmost dialog, not the one underneath", () => {
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    const bottom = render(
      <AccessibleModal onClose={closeBottom} titleId="stack-bottom" modal={false}>
        <h2 id="stack-bottom">Drawer</h2>
      </AccessibleModal>,
    );
    const top = render(
      <AccessibleModal onClose={closeTop} titleId="stack-top">
        <h2 id="stack-top">Confirm</h2>
      </AccessibleModal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();

    // Once the top dialog unmounts, the drawer becomes topmost again.
    top.unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeBottom).toHaveBeenCalledTimes(1);

    bottom.unmount();
  });
});
