import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AccessibleModal } from "./src/components/shared/AccessibleModal";

describe("AccessibleModal aria-labelledby verification", () => {
  it("applies aria-labelledby attribute from titleId prop", () => {
    render(
      <AccessibleModal onClose={() => {}} titleId="my-modal-title">
        <div id="my-modal-title">Modal Title</div>
        <p>Modal Content</p>
      </AccessibleModal>,
    );

    const dialog = document.body.querySelector('[aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-labelledby")).toBe("my-modal-title");
  });

  it("does not set aria-labelledby when titleId is undefined", () => {
    render(
      <AccessibleModal onClose={() => {}}>
        <p>Modal Content</p>
      </AccessibleModal>,
    );

    const dialog = document.body.querySelector('[aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-labelledby")).toBeNull();
  });
});
