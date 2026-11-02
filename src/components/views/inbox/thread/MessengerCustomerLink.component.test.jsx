import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessengerCustomerLink } from "./MessengerCustomerLink.jsx";

describe("MessengerCustomerLink", () => {
  it("links the customer the staff member picks and does not search by phone on its own", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn().mockResolvedValue([
      { id: "human-1", name: "Sarah", surname: "Jones" },
    ]);
    const onLink = vi.fn().mockResolvedValue({ ok: true });
    render(<MessengerCustomerLink onSearch={onSearch} onLink={onLink} />);

    expect(screen.getByText(/not linked to a customer/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link to customer" }));
    await user.type(screen.getByLabelText("Search customers to link"), "Sarah");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearch).toHaveBeenCalledWith("Sarah");
    await user.click(screen.getByRole("button", { name: "Sarah Jones" }));
    expect(onLink).toHaveBeenCalledWith("human-1");
  });
});