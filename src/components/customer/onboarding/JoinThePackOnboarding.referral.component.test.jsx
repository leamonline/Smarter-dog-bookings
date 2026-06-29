import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

// AddressPicker does postcode lookups; stub it to a no-op so the onboarding
// form renders without network/UI noise for these referral-field tests.
vi.mock("./AddressPicker.jsx", () => ({
  AddressPicker: () => <div data-testid="address-picker" />,
}));

const { JoinThePackOnboarding } = await import("./JoinThePackOnboarding.jsx");

function renderForm() {
  return render(
    <ToastProvider>
      <JoinThePackOnboarding humanRecord={{ id: "h-referral", phone: "+447700900000" }} />
    </ToastProvider>,
  );
}

describe("JoinThePackOnboarding — referral source", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers the referral dropdown with the configured options", () => {
    renderForm();
    expect(
      screen.getByLabelText("Where did you hear about us?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "TikTok" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Vet / groomer referral" }),
    ).toBeInTheDocument();
  });

  it("reveals a free-text box only when 'Other' is chosen", () => {
    renderForm();
    expect(
      screen.queryByLabelText("Tell us where you heard about us"),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Where did you hear about us?"), {
      target: { value: "Other" },
    });

    expect(
      screen.getByLabelText("Tell us where you heard about us"),
    ).toBeInTheDocument();
  });
});
