import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { JoinThePackOnboarding } from "./JoinThePackOnboarding.jsx";

const actions = vi.hoisted(() => ({
  connected: true,
  lookupPostcode: vi.fn(),
  submitSignup: vi.fn(),
}));
vi.mock("../../../supabase/hooks/useCustomerOnboardingActions", () => ({
  useCustomerOnboardingActions: () => actions,
}));

const humanRecord = { id: "signup-validation-test", phone: "+447700900000" };
function renderForm() {
  return render(<ToastProvider><JoinThePackOnboarding humanRecord={humanRecord} /></ToastProvider>);
}
function change(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fillOwner() {
  change("First name", "Alex");
  change("Surname", "Tester");
  change("Email address", "alex@example.test");
  fireEvent.click(screen.getByRole("button", { name: /Enter it manually/ }));
  change("Full address", "1 Example Road, Example Town");
  change("Postcode", "SK14 6JE");
  fireEvent.click(screen.getByRole("checkbox"));
}
function attemptContinue() {
  fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form"));
}

describe("signup validation and address recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    actions.lookupPostcode.mockReset();
    actions.submitSignup.mockReset();
  });

  it("lets customers attempt Continue and explains every missing required owner field", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    attemptContinue();
    expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted details");
    expect(screen.getByLabelText("First name")).toHaveAccessibleDescription("Enter your first name.");
    expect(screen.getByLabelText("First name")).toHaveFocus();
    expect(screen.getByLabelText("Surname")).toHaveAccessibleDescription("Enter your surname.");
    expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription("Enter a valid email address.");
    expect(screen.getByLabelText("Postcode")).toHaveAccessibleDescription(/Select your address or enter it manually/);
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(/Please agree/);
    expect(actions.submitSignup).not.toHaveBeenCalled();
  });

  it("focuses a missing email after manual address entry, then advances once corrected", () => {
    renderForm();
    fillOwner();
    change("Email address", "");
    attemptContinue();
    expect(screen.getByLabelText("Email address")).toHaveFocus();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    change("Email address", "alex@example.test");
    attemptContinue();
    expect(screen.getByRole("heading", { name: "About your dog" })).toBeInTheDocument();
    expect(actions.submitSignup).not.toHaveBeenCalled();
  });

  it("explains the conditional Other referral field", () => {
    renderForm();
    fillOwner();
    change("Where did you hear about us?", "Other");
    attemptContinue();
    expect(screen.getByLabelText("Tell us where you heard about us")).toHaveFocus();
    expect(screen.getByLabelText("Tell us where you heard about us")).toHaveAccessibleDescription(/Tell us where you heard about us/);
  });

  it("preserves the manual address and postcode when returning from the dog step", () => {
    renderForm();
    fillOwner();
    attemptContinue();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Full address")).toHaveValue("1 Example Road, Example Town");
    expect(screen.getByLabelText("Postcode")).toHaveValue("SK14 6JE");
    attemptContinue();
    expect(screen.getByRole("heading", { name: "About your dog" })).toBeInTheDocument();
  });

  it("preserves the postcode after restoring the saved owner draft", async () => {
    const view = renderForm();
    fillOwner();
    view.unmount();
    renderForm();
    await waitFor(() => {
      const draft = JSON.parse(localStorage.getItem(`sdb:draft:signup:${humanRecord.id}`));
      expect(draft.data.addr.postcode).toBe("SK14 6JE");
    });
    attemptContinue();
    expect(screen.getByRole("heading", { name: "About your dog" })).toBeInTheDocument();
  });

  it("allows manual entry and progression when the postcode service fails", async () => {
    actions.lookupPostcode.mockResolvedValue({
      error: { context: new Response(JSON.stringify({ error: "upstream" }), { status: 502 }) },
    });
    renderForm();
    change("Postcode", "SK14 6JE");
    fireEvent.click(screen.getByRole("button", { name: "Find address" }));
    expect(await screen.findByText(/Couldn't search just now/)).toBeInTheDocument();
    fillOwner();
    attemptContinue();
    expect(screen.getByRole("heading", { name: "About your dog" })).toBeInTheDocument();
  });
});
