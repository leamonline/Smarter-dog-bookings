import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrustedHumansSection } from "./TrustedHumansSection.jsx";

const salonLinked = {
  id: "trusted-1",
  name: "Jess",
  surname: "Harper",
  phone: "+447700900123",
  relationship: "Neighbour",
};

const customerAdded = {
  id: "contact-1",
  name: "Gran",
  surname: "Smith",
  phone: "+447700900124",
  relationship: "Mum",
};

function renderCard(props = {}) {
  const onSave = props.onSave ?? vi.fn().mockResolvedValue({ contact: {}, error: null });
  const onRemove = props.onRemove ?? vi.fn().mockResolvedValue({ error: null });
  const onChanged = vi.fn();
  render(
    <TrustedHumansSection
      trustedHumans={[]}
      customerContacts={[]}
      dogName="Tipi"
      onSave={onSave}
      onRemove={onRemove}
      onChanged={onChanged}
      {...props}
    />,
  );
  return { onSave, onRemove, onChanged };
}

function fill(label, value) {
  fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value } });
}

describe("TrustedHumansSection", () => {
  it("keeps salon-added people visible and read-only", () => {
    renderCard({ trustedHumans: [salonLinked] });
    expect(screen.getByText("Jess Harper")).toBeInTheDocument();
    expect(screen.getByText("Neighbour")).toBeInTheDocument();
    expect(screen.getByText("Added by the salon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Jess Harper/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it("lets a customer add someone, live straight away, with the phone normalised", async () => {
    const { onSave, onChanged } = renderCard();
    expect(screen.getByText("Add someone who can drop off or collect Tipi.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add a trusted human" }));
    const form = screen.getByRole("form", { name: "Add a trusted human" });
    expect(within(form).getByText(/let them know you've shared their details/i)).toBeInTheDocument();

    fill("First name", "Gran");
    fill("Surname", "Smith");
    fill("Phone number", "07700 900124");
    fill("Relationship", "Mum");
    fireEvent.click(within(form).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("added"));
    expect(onSave).toHaveBeenCalledWith({
      id: null,
      name: "Gran",
      surname: "Smith",
      phone: "+447700900124",
      relationship: "Mum",
    });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("refuses a broken mobile before anything is sent", () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add a trusted human" }));
    fill("First name", "Gran");
    fill("Phone number", "0770090012");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/digits don't add up/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("needs a name and a phone number", () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add a trusted human" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please add their first name.");
    fill("First name", "Gran");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please add their phone number.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the form open with a plain message when the database refuses", async () => {
    const onSave = vi.fn().mockResolvedValue({ contact: null, error: { message: "too_many_contacts" } });
    renderCard({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Add a trusted human" }));
    fill("First name", "Gran");
    fill("Phone number", "07700900124");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can add up to 6 trusted humans.");
    expect(screen.getByRole("form", { name: "Add a trusted human" })).toBeInTheDocument();
  });

  it("edits and removes a customer-added person through the one Edit control", async () => {
    const { onSave, onRemove, onChanged } = renderCard({ customerContacts: [customerAdded] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Gran Smith" }));
    expect(screen.getByRole("textbox", { name: "First name" })).toHaveValue("Gran");

    fill("Relationship", "Grandma");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("saved"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "contact-1", relationship: "Grandma" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Gran Smith" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("removed"));
    expect(onRemove).toHaveBeenCalledWith("contact-1");
  });

  it("stops offering Add at six customer-added people", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ ...customerAdded, id: `c${i}`, name: `Person${i}` }));
    renderCard({ customerContacts: six });
    expect(screen.queryByRole("button", { name: "Add a trusted human" })).not.toBeInTheDocument();
  });

  // The list is only meaningful once its own read has succeeded. While it is
  // in flight or after it failed, an empty card would read as "you have no
  // trusted humans" to someone who has several — and must not offer Add.
  it("says it is still fetching while the read is in flight", () => {
    renderCard({ status: "loading" });
    expect(screen.getByText(/fetching your trusted humans/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a trusted human" })).not.toBeInTheDocument();
  });

  it("owns a failed read with its own retry instead of looking empty", () => {
    const onRetry = vi.fn();
    renderCard({ status: "error", onRetry });
    expect(screen.getByText(/couldn.t load your trusted humans/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a trusted human" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
