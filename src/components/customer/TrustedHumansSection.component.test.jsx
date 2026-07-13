import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { TrustedHumansSection } from "./TrustedHumansSection.jsx";

const existingContact = {
  id: "trusted-1",
  name: "Jess",
  surname: "Harper",
  phone: "+44 7700 900123",
  relationship: "Neighbour",
};

describe("TrustedHumansSection", () => {
  it("keeps existing contacts visible without offering customer creation", () => {
    render(
      <ToastProvider>
        <TrustedHumansSection trustedHumans={[existingContact]} />
      </ToastProvider>,
    );

    expect(screen.getByText("Jess Harper")).toBeInTheDocument();
    expect(screen.getByText("Neighbour")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Adding a trusted human online is temporarily unavailable.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /add a trusted human/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /first name/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /mobile number/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
