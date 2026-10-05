import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AddressPicker } from "./AddressPicker.jsx";
const actions = vi.hoisted(() => ({ lookupAddress: vi.fn() }));
vi.mock("../../../supabase/hooks/useCustomerOnboardingActions", () => ({
  useCustomerOnboardingActions: () => actions,
}));
const address = {
  line: "1 Example Road, Example Town, SK14 6JE",
  postcode: "SK14 6JE",
  udprn: null,
};
function search(text = "1 Example Road, Example Town") {
  fireEvent.change(screen.getByLabelText("Search for your address"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find address" }));
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("Geoapify suggestions and manual recovery", () => {
  beforeEach(() => actions.lookupAddress.mockReset());
  it("searches only on request and reports the selected address and postcode", async () => {
    const onChange = vi.fn();
    actions.lookupAddress.mockResolvedValue({
      data: {
        postcode: null,
        addresses: [address, { ...address, line: "2 Example Road" }],
      },
      error: null,
    });
    render(<AddressPicker onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Search for your address"), {
      target: { value: "1 Example Road, Example Town" },
    });
    expect(actions.lookupAddress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find address" }));
    const select = await screen.findByLabelText("Select your address");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: false }),
    );
    fireEvent.change(select, { target: { value: "0" } });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ready: true,
        address: address.line,
        postcode: address.postcode,
        keepingExisting: false,
      }),
    );
    expect(actions.lookupAddress).toHaveBeenCalledOnce();
    expect(actions.lookupAddress).toHaveBeenCalledWith(
      "1 Example Road, Example Town",
    );
    expect(screen.getByRole("link", { name: "Geoapify" })).toHaveAttribute(
      "href",
      "https://www.geoapify.com/",
    );
    expect(screen.getByRole("link", { name: /OpenStreetMap/ })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });
  it("clears a selected suggestion when search text changes", async () => {
    const onChange = vi.fn();
    actions.lookupAddress.mockResolvedValue({
      data: { addresses: [address] },
      error: null,
    });
    render(<AddressPicker onChange={onChange} />);
    search();
    await screen.findByLabelText("Select your address");
    fireEvent.change(screen.getByLabelText("Select your address"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Search for your address"), {
      target: { value: "9 Different Street" },
    });
    expect(
      screen.queryByLabelText("Select your address"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ ready: false, address: null }),
      ),
    );
  });
  it("ignores an in-flight result after the customer edits their search", async () => {
    const pending = deferred();
    actions.lookupAddress.mockReturnValue(pending.promise);
    render(<AddressPicker />);
    search();
    fireEvent.change(screen.getByLabelText("Search for your address"), {
      target: { value: "New search" },
    });
    await act(async () =>
      pending.resolve({ data: { addresses: [address] }, error: null }),
    );
    expect(
      screen.queryByLabelText("Select your address"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search for your address")).toHaveValue(
      "New search",
    );
  });
  it("preserves manual input when an old search finishes", async () => {
    const pending = deferred();
    const onChange = vi.fn();
    actions.lookupAddress.mockReturnValue(pending.promise);
    render(<AddressPicker onChange={onChange} />);
    search("1 Example Road, SK14 6JE");
    fireEvent.click(screen.getByRole("button", { name: /Enter it manually/ }));
    fireEvent.change(screen.getByLabelText("Full address"), {
      target: { value: "Willow House, Example Road" },
    });
    expect(screen.getByLabelText("Postcode")).toHaveValue("SK14 6JE");
    await act(async () =>
      pending.resolve({ data: { addresses: [address] }, error: null }),
    );
    expect(screen.getByLabelText("Full address")).toHaveValue(
      "Willow House, Example Road",
    );
    expect(
      screen.queryByLabelText("Select your address"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ready: true,
          address: "Willow House, Example Road",
          postcode: "SK14 6JE",
        }),
      ),
    );
  });
  for (const error of [
    "not_configured",
    "upstream",
    "rate_limited",
    "invalid_search",
  ]) {
    it(`allows manual entry after ${error}`, async () => {
      actions.lookupAddress.mockResolvedValue({
        error: {
          context: new Response(JSON.stringify({ error }), { status: 502 }),
        },
      });
      const onChange = vi.fn();
      render(<AddressPicker onChange={onChange} />);
      search("SK146JE");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Find address" }),
        ).toBeEnabled(),
      );
      fireEvent.click(
        screen.getByRole("button", { name: /Enter it manually/ }),
      );
      expect(screen.getByLabelText("Full address")).toHaveValue("");
      expect(screen.getByLabelText("Postcode")).toHaveValue("SK14 6JE");
      fireEvent.change(screen.getByLabelText("Full address"), {
        target: { value: "1 Example Road, Example Town" },
      });
      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({
            ready: true,
            address: "1 Example Road, Example Town",
            postcode: "SK14 6JE",
          }),
        ),
      );
    });
  }
  it("explains no suggestions without claiming the postcode is invalid", async () => {
    actions.lookupAddress.mockResolvedValue({
      data: { addresses: [] },
      error: null,
    });
    render(<AddressPicker />);
    search();
    expect(
      await screen.findByText(/No address suggestions found/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/doesn't look like a full UK postcode/),
    ).not.toBeInTheDocument();
  });
});
