import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
import { logger } from "../../lib/logger";

describe("IconButton", () => {
  it("is named by its label", () => {
    render(<IconButton label="Close"><svg aria-hidden="true" /></IconButton>);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("is a plain button by default, so it never submits a form by accident", () => {
    render(<IconButton label="Close" />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("fires onClick and not when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<IconButton label="Close" onClick={onClick} />);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<IconButton label="Close" onClick={onClick} disabled />);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(["sm", "md"])("keeps the touch-size floor at size %s", (size) => {
    render(<IconButton label="Close" size={size} />);
    expect(screen.getByRole("button").className).toMatch(/pointer-coarse:min-h-11/);
    expect(screen.getByRole("button").className).toMatch(/pointer-coarse:min-w-11/);
  });

  it("danger keeps a white label on the dark coral fill", () => {
    render(<IconButton label="Delete" variant="danger" />);
    const cls = screen.getByRole("button").className;
    expect(cls).toMatch(/(^|\s)bg-brand-coral-dark(\s|$)/);
    expect(cls).toMatch(/(^|\s)text-white(\s|$)/);
  });

  it("does not use the focus ring or outline-none shortcut", () => {
    render(<IconButton label="Close" />);
    const cls = screen.getByRole("button").className;
    expect(cls).toMatch(/focus-visible:ring-2/);
    expect(cls).not.toMatch(/outline-none/);
  });

  it("warns in development when the label is missing", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    render(<IconButton />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("missing label"));
    warn.mockRestore();
  });
});
