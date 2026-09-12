// The context rail's overlay contract, kept in its own spec file on purpose.
//
// react-aria's FocusScope tracks the active scope in a module-level singleton
// shared by every scope mounted from the same module instance. Vitest isolates
// module registries per FILE, not per test, so a spec that mounts several
// shells leaves that singleton pointing at a scope that no longer exists and
// containment silently declines to engage. Testing the real keyboard outcome —
// rather than which props we passed — means starting from a clean module.
import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCKED_RAIL_QUERY } from "./dockedRail";
import { InboxWorkspaceShell } from "./InboxWorkspaceShell.jsx";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

// jsdom has no matchMedia, so by default useMediaQuery answers false and the
// shell renders as it does below the docking breakpoint. These tests drive the
// query directly so a resize across it can be simulated mid-session.
function installViewport(docked) {
  const listeners = new Set();
  const makeQuery = (media, matches) => ({
    matches,
    media,
    onchange: null,
    addEventListener: (type, listener) => {
      if (type === "change" && media === DOCKED_RAIL_QUERY) listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === "change") listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  const railQuery = makeQuery(DOCKED_RAIL_QUERY, docked);
  // Anything react-aria asks gets a plain non-matching stub rather than a
  // throw, so its own focus handling still runs.
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query) =>
      (query === DOCKED_RAIL_QUERY ? railQuery : makeQuery(query, false))),
  });
  return {
    resizeTo(nextDocked) {
      railQuery.matches = nextDocked;
      act(() => {
        for (const listener of listeners) listener({ matches: nextDocked });
      });
    },
  };
}

function renderOpenContext(overrides = {}) {
  const props = {
    rootRef: createRef(),
    fillHeight: 640,
    mobilePane: "context",
    contextOpen: true,
    contextSection: "booking",
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

/** A control in the thread behind the context — the composer, in practice. */
function addThreadControl() {
  const button = document.createElement("button");
  button.textContent = "Composer";
  document.body.appendChild(button);
  return button;
}

function insideContext() {
  return screen.getByRole("button", { name: "Back to message thread" });
}

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  } else {
    delete window.matchMedia;
  }
});

describe("InboxWorkspaceShell context rail", () => {
  it("lets focus and Escape leave once the rail docks", () => {
    // At `wide` the context is the workspace grid's third column. Nothing is
    // covered, so containing focus would strand a keyboard user in a pane they
    // can see straight past, and there is no overlay for Escape to dismiss.
    const onDismissContext = vi.fn();
    installViewport(true);
    const composer = addThreadControl();
    renderOpenContext({ onDismissContext });

    insideContext().focus();
    composer.focus();
    expect(composer).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismissContext).not.toHaveBeenCalled();

    composer.remove();
  });

  it("takes focus and Escape back when the window narrows mid-session", () => {
    // Same open context, now an overlay again: a sheet over the thread has to
    // hold focus, or Tab lands on controls the staff member cannot see.
    const onDismissContext = vi.fn();
    const viewport = installViewport(true);
    const composer = addThreadControl();
    renderOpenContext({ onDismissContext });

    viewport.resizeTo(false);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismissContext).toHaveBeenCalledTimes(1);

    insideContext().focus();
    composer.focus();
    expect(composer).not.toHaveFocus();
    expect(insideContext()).toHaveFocus();

    composer.remove();
  });

  it("contains focus in a compact window that never docked", () => {
    installViewport(false);
    const composer = addThreadControl();
    renderOpenContext();

    insideContext().focus();
    composer.focus();

    expect(composer).not.toHaveFocus();
    expect(insideContext()).toHaveFocus();

    composer.remove();
  });
});
