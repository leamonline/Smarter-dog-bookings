import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddressPicker } from "./AddressPicker.jsx";

const actions = { lookupPostcode: vi.fn() };
vi.mock("../../../supabase/hooks/useCustomerOnboardingActions", () => ({
  useCustomerOnboardingActions: () => actions,
}));

/** A rejected postcode arrives as a FunctionsHttpError whose body says why. */
function rejected(error) {
  return { data: null, error: { context: { json: async () => ({ error }) } } };
}

function searchFor(postcode) {
  fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: postcode } });
  fireEvent.click(screen.getByRole("button", { name: /find address/i }));
}

describe("AddressPicker — the way out when the lookup fails", () => {
  beforeEach(() => actions.lookupPostcode.mockReset());

  // Every outcome where the lookup has let the customer down must offer a real
  // button, not only the small text link. Customers stalled at this step and
  // messaged the salon instead of finishing sign-up.
  it.each([
    ["the postcode is rejected", () => rejected("invalid_postcode")],
    ["no addresses are found", () => ({ data: { postcode: "M1 1AA", addresses: [] } })],
    ["the lookup errors", () => rejected("upstream_unavailable")],
  ])("shows an 'Enter it manually instead' button when %s", async (_label, outcome) => {
    actions.lookupPostcode.mockResolvedValue(outcome());
    render(<AddressPicker onChange={() => {}} />);

    searchFor("M1 1AA");

    const button = await screen.findByRole("button", { name: "Enter it manually instead" });
    fireEvent.click(button);
    expect(screen.getByLabelText("Full address")).toBeTruthy();
  });

  it("tells the customer about the manual route when the postcode is rejected", async () => {
    actions.lookupPostcode.mockResolvedValue(rejected("invalid_postcode"));
    render(<AddressPicker onChange={() => {}} />);

    searchFor("M1");

    expect(await screen.findByText(/enter your address manually below/i)).toBeTruthy();
  });

  it("carries the typed postcode into manual entry and reports a ready address", async () => {
    actions.lookupPostcode.mockResolvedValue(rejected("invalid_postcode"));
    const onChange = vi.fn();
    render(<AddressPicker onChange={onChange} />);

    searchFor("m1 1aa");
    fireEvent.click(await screen.findByRole("button", { name: "Enter it manually instead" }));

    const postcodeInputs = screen.getAllByLabelText("Postcode");
    expect(postcodeInputs[postcodeInputs.length - 1].value).toBe("M1 1AA");

    fireEvent.change(screen.getByLabelText("Full address"), {
      target: { value: "1 Example Street, Exampletown" },
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ ready: true, postcode: "M1 1AA" }),
      ),
    );
  });

  it("keeps the quiet text link before any search has failed", () => {
    render(<AddressPicker onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /can't find your address\? enter it manually/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enter it manually instead" })).toBeNull();
  });
});
