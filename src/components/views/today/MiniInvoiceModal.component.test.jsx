import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalShell } from "../../modals/shell/ModalShell.jsx";
import { MiniInvoiceModal } from "./MiniInvoiceModal.jsx";

const bookingFixture = {
  id: "b1",
  dogName: "Jack",
  service: "full-groom",
  size: "small",
  slot: "09:00",
  addons: [],
  payment: "Due at Pick-up",
  depositAmount: null,
  priceOverride: null,
};

const dogFixture = { id: "d1", name: "Jack", customPrice: null };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MiniInvoiceModal", () => {
  it("prefills the outstanding balance and submits the selected method", async () => {
    const onSave = vi.fn().mockResolvedValue({ id: "b1" });
    render(
      <MiniInvoiceModal
        booking={{ ...bookingFixture, payment: "Deposit Paid", depositAmount: 10 }}
        dog={dogFixture}
        configPricing={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Payment received")).toHaveValue(32);
    fireEvent.click(screen.getByRole("radio", { name: "Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          payment: "Paid in Full",
          paymentMethod: "card",
          paidAmount: 42,
        }),
      ),
    );
  });

  it("keeps the compact add-on and method controls fully operable", () => {
    render(
      <MiniInvoiceModal
        booking={bookingFixture}
        dog={dogFixture}
        configPricing={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const fleaBath = screen.getByRole("button", { name: "Flea Bath, £10" });
    expect(fleaBath).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(fleaBath);

    expect(fleaBath).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Payment received")).toHaveValue(52);
    expect(screen.getAllByText("£52")).toHaveLength(2);

    fireEvent.click(screen.getByRole("radio", { name: "Card" }));
    expect(screen.getByRole("radio", { name: "Card" })).toBeChecked();
  });

  it("preserves an existing paid booking and its retained deposit when saved unchanged", async () => {
    const onSave = vi.fn().mockResolvedValue({ id: "b1" });
    render(
      <MiniInvoiceModal
        booking={{
          ...bookingFixture,
          payment: "Paid in Full",
          depositAmount: 10,
          paymentMethod: "card",
          paidAmount: 42,
        }}
        dog={dogFixture}
        configPricing={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Deposit received")).toHaveValue(10);
    expect(screen.getByLabelText("Payment received")).toHaveValue(32);
    expect(screen.getByRole("radio", { name: "Card" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        priceOverride: 42,
        addons: [],
        payment: "Paid in Full",
        depositAmount: 10,
        paymentMethod: "card",
        paidAmount: 42,
      }),
    );
  });

  it("updates an existing paid booking balance when its price changes", async () => {
    const onSave = vi.fn().mockResolvedValue({ id: "b1" });
    render(
      <MiniInvoiceModal
        booking={{
          ...bookingFixture,
          payment: "Paid in Full",
          depositAmount: 10,
          paymentMethod: "cash",
          paidAmount: 42,
        }}
        dog={dogFixture}
        configPricing={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Base groom price"), {
      target: { value: "46" },
    });

    expect(screen.getByLabelText("Payment received")).toHaveValue(36);
    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          priceOverride: 46,
          payment: "Paid in Full",
          depositAmount: 10,
          paymentMethod: "cash",
          paidAmount: 46,
        }),
      ),
    );
  });

  it("requires a method before saving a legacy paid booking", async () => {
    const onSave = vi.fn();
    render(
      <MiniInvoiceModal
        booking={{
          ...bookingFixture,
          payment: "Paid in Full",
          depositAmount: 10,
          paymentMethod: null,
          paidAmount: 42,
        }}
        dog={dogFixture}
        configPricing={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Payment received")).toHaveValue(32);
    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose Cash, Card or Bank transfer",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps edited values and shows an inline error when the save fails", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(
      <MiniInvoiceModal
        booking={bookingFixture}
        dog={dogFixture}
        configPricing={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Base groom price"), {
      target: { value: "46" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Cash" }));
    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Payment could not be saved");
    expect(screen.getByLabelText("Base groom price")).toHaveValue(46);
  });

  it("ignores backdrop dismissal while a save is pending", async () => {
    let resolveSave;
    const onSave = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <MiniInvoiceModal
        booking={bookingFixture}
        dog={dogFixture}
        configPricing={null}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("Base groom price"), {
      target: { value: "46" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Cash" }));
    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    const dialog = screen.getByRole("dialog", { name: "Invoice · Jack" });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.click(dialog.parentElement);
    expect(onClose).not.toHaveBeenCalled();

    resolveSave(null);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Payment could not be saved",
    );
    expect(screen.getByLabelText("Base groom price")).toHaveValue(46);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("preserves an edited payment while pricing changes and rejects a partial balance", async () => {
    const onSave = vi.fn();
    render(
      <MiniInvoiceModal
        booking={bookingFixture}
        dog={dogFixture}
        configPricing={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Payment received"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Base groom price"), {
      target: { value: "46" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Cash" }));
    fireEvent.click(screen.getByRole("button", { name: "Save payment" }));

    expect(screen.getByLabelText("Payment received")).toHaveValue(20);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the full £46 balance or update the deposit amount",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses a labelled mobile sheet while retaining modal accessibility behaviour", () => {
    render(
      <MiniInvoiceModal
        booking={bookingFixture}
        dog={dogFixture}
        configPricing={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Invoice · Jack" });
    expect(dialog).toHaveClass("max-sm:rounded-t-[24px]");
    expect(dialog.parentElement).toHaveClass("items-end");
  });

  it("confirms dirty close with the approved prompt", () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <MiniInvoiceModal
        booking={bookingFixture}
        dog={dogFixture}
        configPricing={null}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("Deposit received"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(confirm).toHaveBeenCalledWith("Discard these invoice changes?");
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ModalShell mobile presentation", () => {
  it("keeps the existing full-screen mobile presentation by default", () => {
    render(
      <ModalShell
        titleId="default-shell-title"
        onClose={vi.fn()}
        header={<h2 id="default-shell-title">Default shell</h2>}
      >
        Body
      </ModalShell>,
    );

    const dialog = screen.getByRole("dialog", { name: "Default shell" });
    expect(dialog).toHaveClass("max-sm:h-[100dvh]", "max-sm:rounded-none");
    expect(dialog.parentElement).toHaveClass("items-center");
  });
});
