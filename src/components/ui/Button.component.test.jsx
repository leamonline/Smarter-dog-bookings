import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./Button";

// designTokens.a11y.test.ts proves the coral-dark fill and the coral-deep hover
// clear 4.5:1 under a white label, and that Button.jsx's source contains the
// fill. This checks what the rendered button actually gets, hover included, so
// a lighter coral cannot slip back in on either size.
describe("Button danger variant keeps its white label readable", () => {
  it.each(["sm", "md"])("%s size", (size) => {
    const { getByRole } = render(
      <Button variant="danger" size={size}>
        Cancel booking
      </Button>,
    );
    const cls = getByRole("button").className;
    expect(cls).toMatch(/(^|\s)bg-brand-coral-dark(\s|$)/);
    expect(cls).toMatch(/(^|\s)hover:bg-brand-coral-deep(\s|$)/);
    expect(cls).toMatch(/(^|\s)text-white(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)(hover:)?bg-brand-coral(\s|$)/);
  });
});

describe("Button quiet variant", () => {
  it("has no fill or border until hovered, and a readable disabled state", () => {
    const { getByRole } = render(<Button variant="quiet">Show more</Button>);
    const cls = getByRole("button").className;
    expect(cls).toMatch(/(^|\s)bg-transparent(\s|$)/);
    expect(cls).toMatch(/(^|\s)border-transparent(\s|$)/);
    expect(cls).toMatch(/(^|\s)hover:bg-slate-100(\s|$)/);
    expect(cls).toMatch(/(^|\s)disabled:text-slate-500(\s|$)/);
  });

  it("keeps the touch-size floor of the other variants", () => {
    const { getByRole } = render(<Button variant="quiet">Show more</Button>);
    expect(getByRole("button").className).toMatch(/pointer-coarse:min-h-11/);
  });
});

describe("Button strong variant", () => {
  it("is a charcoal fill with a white label, and softens on hover", () => {
    const { getByRole } = render(<Button variant="strong">Confirm</Button>);
    const cls = getByRole("button").className;
    expect(cls).toMatch(/(^|\s)bg-ink(\s|$)/);
    expect(cls).toMatch(/(^|\s)text-white(\s|$)/);
    expect(cls).toMatch(/(^|\s)hover:bg-ink-soft(\s|$)/);
  });

  it("is never the yellow primary", () => {
    const { getByRole } = render(<Button variant="strong">Confirm</Button>);
    expect(getByRole("button").className).not.toMatch(/bg-brand-yellow/);
  });

  it("keeps a readable disabled state and the touch floor", () => {
    const { getByRole } = render(<Button variant="strong" disabled>Confirm</Button>);
    const cls = getByRole("button").className;
    expect(cls).toMatch(/disabled:bg-slate-100/);
    expect(cls).toMatch(/disabled:text-slate-600/);
    expect(cls).toMatch(/pointer-coarse:min-h-11/);
  });
});
