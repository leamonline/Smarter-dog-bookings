// Messaging a customer from a deep link (`/inbox?human=…`) in sample-data mode.
// The contact loaders throw "Not connected" synchronously offline, and doing so
// inside the pre-target effect took the whole inbox down to its error screen.
// The day stack's WhatsApp action is one way in; the customer profile's Message
// button is another.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComposeNewModal } from "./ComposeNewModal.jsx";

vi.mock("../../../../supabase/client", () => ({ supabase: null }));

vi.mock("../thread/TemplatePicker.jsx", () => ({
  TemplatePicker: () => null,
}));

describe("ComposeNewModal without a connection", () => {
  it("opens on the customer picker instead of crashing when deep-linked to a customer", () => {
    expect(() => render(
      <ComposeNewModal initialHumanId="h10" onClose={vi.fn()} onSent={vi.fn()} onSentSMS={vi.fn()} />,
    )).not.toThrow();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name, surname, phone, or dog name…")).toBeInTheDocument();
  });
});
