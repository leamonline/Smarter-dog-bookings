// Copy actions on the deposit instructions.
//
// A deposit is paid from a banking app, so every character of the reference,
// sort code and account number is retyped by hand — and a mistyped reference
// is a payment staff cannot match. The copy buttons remove the retyping. The
// details stay on screen as plain text, which is the fallback whenever the
// browser will not copy, and nothing about copying implies the deposit is paid.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DepositHoldInstructions } from "./DepositHoldInstructions";

const BANK = { accountName: "Smarter Dog", sortCode: "01-02-03", accountNumber: "12345678" };

function renderInstructions(overrides: Partial<Parameters<typeof DepositHoldInstructions>[0]> = {}) {
  return render(
    <DepositHoldInstructions
      amount={10}
      reference="SDG-7K3M"
      dueBy="2099-06-14T09:00:00Z"
      bank={BANK}
      {...overrides}
    />,
  );
}

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

describe("DepositHoldInstructions copy actions", () => {
  afterEach(() => {
    stubClipboard(undefined);
  });

  it("offers to copy the reference, sort code and account number", () => {
    renderInstructions();

    expect(screen.getByRole("button", { name: "Copy reference" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy sort code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy account number" })).toBeInTheDocument();
  });

  it("copies the exact value and says what was copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    renderInstructions();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy reference" }));
    });
    expect(writeText).toHaveBeenCalledWith("SDG-7K3M");
    expect(screen.getByRole("status")).toHaveTextContent("Reference copied");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy account number" }));
    });
    expect(writeText).toHaveBeenLastCalledWith("12345678");
    expect(screen.getByRole("status")).toHaveTextContent("Account number copied");
  });

  it("asks for a copy by hand when the browser has no clipboard", async () => {
    stubClipboard(undefined);
    renderInstructions();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy sort code" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent(/couldn.t copy that.*by hand/i);
    // The detail itself is still on screen to copy from.
    expect(screen.getByText("01-02-03")).toBeInTheDocument();
  });

  it("asks for a copy by hand when the browser refuses the copy", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    renderInstructions();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy reference" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent(/couldn.t copy that.*by hand/i);
  });

  it("never suggests the deposit is paid or the booking confirmed", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    renderInstructions();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy reference" }));
    });
    expect(screen.getByRole("status")).not.toHaveTextContent(/paid|confirm|received/i);
  });

  it("offers only what exists", () => {
    renderInstructions({ reference: null, bank: null });

    expect(screen.queryByRole("button", { name: /^Copy/ })).not.toBeInTheDocument();
  });
});
