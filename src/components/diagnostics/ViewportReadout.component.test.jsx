import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ViewportReadout,
  formatSnapshot,
  readoutEnabled,
  snapshot,
} from "./ViewportReadout.jsx";

const goTo = (path) => window.history.replaceState({}, "", path);

afterEach(() => {
  window.sessionStorage.clear();
  goTo("/");
  document.getElementById("pii")?.remove();
});

describe("ViewportReadout", () => {
  it("renders nothing unless asked for", () => {
    render(<ViewportReadout />);
    expect(screen.queryByTestId("viewport-readout")).not.toBeInTheDocument();
  });

  it("turns on with ?vvdebug=1, stays on for the tab, and off with ?vvdebug=0", () => {
    goTo("/inbox?vvdebug=1");
    expect(readoutEnabled()).toBe(true);
    goTo("/inbox");
    expect(readoutEnabled()).toBe(true);
    goTo("/inbox?vvdebug=0");
    expect(readoutEnabled()).toBe(false);
    goTo("/inbox");
    expect(readoutEnabled()).toBe(false);
  });

  it("shows geometry only: nothing from the page's own text reaches it", async () => {
    // A real thread has names, phone numbers and message text on screen.
    // The readout must carry none of it, on screen or to Sentry.
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="pii">Sarah Jones +447700900123 Marley full groom Thankyou x</div>',
    );
    goTo("/inbox?vvdebug=1");
    render(<ViewportReadout />);
    const box = await screen.findByTestId("viewport-readout");
    const text = box.textContent;
    expect(text).toContain("build local");
    expect(text).toContain("keyboard false");
    for (const leak of ["Sarah", "Jones", "447700", "Marley", "Thankyou"]) {
      expect(text).not.toContain(leak);
    }
    // Sentry gets the same shape; check the object itself, not just the text.
    expect(JSON.stringify(snapshot())).not.toMatch(/Sarah|447700|Marley|Thankyou/);
  });

  it("formats one compact line per concern so a phone screenshot can hold it", () => {
    expect(formatSnapshot(snapshot()).split("\n")).toHaveLength(8);
  });
});
