import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DrawerShell } from "./DrawerShell";

afterEach(() => {
  // Guard against a leaked scroll lock between tests.
  document.body.style.overflow = "";
});

function getOverlay(): HTMLElement {
  return document.body.querySelector('[class*="inset-0"]') as HTMLElement;
}

describe("DrawerShell", () => {
  it("portals a labelled dialog wrapping its children", () => {
    const { container } = render(
      <DrawerShell onClose={() => {}} titleId="d-title">
        <h2 id="d-title">Panel heading</h2>
        <p>body</p>
      </DrawerShell>,
    );
    // Portaled out of the render container to document.body.
    expect(container.querySelector('[aria-modal="true"]')).toBeNull();
    const dialog = document.body.querySelector('[aria-modal="true"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe("d-title");
    expect(dialog.textContent).toContain("Panel heading");
  });

  it("anchors to the right by default and the left when side='left'", () => {
    const right = render(
      <DrawerShell onClose={() => {}} titleId="r">
        <h2 id="r">R</h2>
      </DrawerShell>,
    );
    expect(getOverlay().className).toContain("justify-end");
    right.unmount();

    render(
      <DrawerShell onClose={() => {}} side="left" titleId="l">
        <h2 id="l">L</h2>
      </DrawerShell>,
    );
    expect(getOverlay().className).toContain("justify-start");
  });

  it("closes on backdrop click and Escape, but not on a click inside the panel", () => {
    const onClose = vi.fn();
    render(
      <DrawerShell onClose={onClose} titleId="c">
        <h2 id="c">C</h2>
      </DrawerShell>,
    );
    // A click inside the panel must NOT close.
    fireEvent.click(document.body.querySelector('[aria-modal="true"]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    // Backdrop click closes.
    fireEvent.click(getOverlay());
    expect(onClose).toHaveBeenCalledTimes(1);
    // Escape closes.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("can opt out of Escape-to-close via dismissOnEscape={false}", () => {
    const onClose = vi.fn();
    render(
      <DrawerShell onClose={onClose} titleId="e" dismissOnEscape={false}>
        <h2 id="e">E</h2>
      </DrawerShell>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("delegates to the reference-counted scroll lock (no leak when stacked)", () => {
    const a = render(
      <DrawerShell onClose={() => {}} titleId="a">
        <h2 id="a">A</h2>
      </DrawerShell>,
    );
    const b = render(
      <DrawerShell onClose={() => {}} side="left" titleId="b">
        <h2 id="b">B</h2>
      </DrawerShell>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    a.unmount();
    // One drawer still open — must stay locked.
    expect(document.body.style.overflow).toBe("hidden");
    b.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
