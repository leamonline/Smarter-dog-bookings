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

describe("the way out when the search fails (#943)", () => {
  beforeEach(() => actions.lookupAddress.mockReset());

  /** A rejected search arrives as a FunctionsHttpError whose body says why. */
  function rejected(error) {
    return {
      data: null,
      error: { context: new Response(JSON.stringify({ error }), { status: 502 }) },
    };
  }

  // Every outcome where the search has let the customer down must offer a real
  // button, not only the small text link. Customers stalled at this step and
  // messaged the salon instead of finishing sign-up.
  it.each([
    ["the search is rejected", () => rejected("invalid_search")],
    ["no suggestions are found", () => ({ data: { postcode: null, addresses: [] }, error: null })],
    ["the search errors", () => rejected("upstream_unavailable")],
  ])("shows an 'Enter it manually instead' button when %s", async (_label, outcome) => {
    actions.lookupAddress.mockResolvedValue(outcome());
    render(<AddressPicker onChange={() => {}} />);

    search("1 Example Road, Example Town");

    const button = await screen.findByRole("button", { name: "Enter it manually instead" });
    fireEvent.click(button);
    expect(screen.getByLabelText("Full address")).toBeInTheDocument();
  });

  it("tells the customer about the manual route when the search is too short", async () => {
    render(<AddressPicker onChange={() => {}} />);

    fireEvent.change(screen.getByLabelText("Search for your address"), { target: { value: "M1" } });
    fireEvent.keyDown(screen.getByLabelText("Search for your address"), { key: "Enter" });

    expect(await screen.findByText(/or enter it manually/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter it manually instead" })).toBeInTheDocument();
    expect(actions.lookupAddress).not.toHaveBeenCalled();
  });

  it("keeps the quiet text link before any search has failed", () => {
    render(<AddressPicker onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /can't find your address\? enter it manually/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enter it manually instead" })).toBeNull();
  });
});
