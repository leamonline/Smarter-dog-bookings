import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaveButton } from "./shared.jsx";

describe("Settings save action", () => {
  it("uses the shared lead action and prevents another save while saving", async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<SaveButton onClick={save} />);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);
    expect(save).toHaveBeenCalledOnce();
    rerender(<SaveButton onClick={save} saving />);
    const saving = screen.getByRole("button", { name: /Saving/ });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute("aria-busy", "true");
    await user.click(saving);
    expect(save).toHaveBeenCalledOnce();
    rerender(<SaveButton onClick={save} saved />);
    expect(screen.getByRole("button", { name: /Saved/ })).toBeVisible();
  });
});
