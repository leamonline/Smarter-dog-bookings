import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomerContextPanel } from "./CustomerContextPanel.jsx";

describe("CustomerContextPanel", () => {
  it("does not show stale customer details while a new context is loading", () => {
    render(
      <CustomerContextPanel
        conversation={{ phone_e164: "+447700900123" }}
        context={{
          human: { id: "old-human", fullName: "Old Customer", phone: "+447700900999" },
          dogs: [],
          lastBooking: null,
          trustedContacts: [],
          summary: "Old Customer has one dog.",
          loading: true,
          error: null,
        }}
      />,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Old Customer")).not.toBeInTheDocument();
    expect(screen.queryByText("Old Customer has one dog.")).not.toBeInTheDocument();
  });
});
