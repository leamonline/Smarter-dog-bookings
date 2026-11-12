import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { JoinThePackOnboarding } from "./JoinThePackOnboarding.jsx";

const actions = vi.hoisted(() => ({
  connected: true,
  lookupAddress: vi.fn(),
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
    actions.lookupAddress.mockReset();
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
    expect(screen.getByLabelText("Search for your address")).toHaveAccessibleDescription(/Select your address or enter it manually/);
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(/Please agree/);
    expect(actions.submitSignup).not.toHaveBeenCalled();
  });

  it("tells the customer, beside the policy agreement, that essential messages are part of booking", () => {
    renderForm();
    const notice = screen.getByTestId("essential-messages-notice");
    expect(notice).toHaveTextContent(/confirmations, reminders, any changes to it/i);
    expect(notice).toHaveTextContent(/text you if it doesn.t reach you/i);
    expect(notice).toHaveTextContent(/promotions .* separately say yes/i);
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

  it("names the dog details still needed, and accepts Not sure for an unknown age", async () => {
    // Audit N-13: a greyed-out Finish button with no reason was a dead end,
    // and a rescue dog of unknown age could not sign up at all.
    actions.submitSignup.mockResolvedValue({ data: { ok: true }, error: null });
    renderForm();
    fillOwner();
    attemptContinue();
    await screen.findByLabelText("Dog's name");

    const finish = screen.getByRole("button", { name: "Finish sign-up" });
    expect(finish).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Still needed: name, breed, sex, birth month, birth year",
    );
    expect(finish).toHaveAccessibleDescription(/Still needed/);

    change("Dog's name", "Dog A");
    fireEvent.change(screen.getAllByLabelText("Breed")[0], { target: { value: "__other__" } });
    fireEvent.change(screen.getAllByLabelText("Breed")[1], { target: { value: "Rescue mix" } });
    change("Sex", "female");
    expect(screen.getByRole("status")).toHaveTextContent("Still needed: birth month, birth year");

    // A real year still needs its month: the year is never dropped silently.
    change("Birth year", "2021");
    expect(screen.getByRole("status")).toHaveTextContent("Still needed: birth month");
    expect(finish).toBeDisabled();
    // "Not sure" is on the year only, and it switches the month off.
    expect(screen.getByLabelText("Birth month")).not.toHaveTextContent("Not sure");
    change("Birth year", "unknown");
    expect(screen.getByLabelText("Birth month")).toBeDisabled();
    expect(screen.queryByText(/Still needed/)).toBeNull();
    expect(finish).toBeEnabled();

    fireEvent.submit(finish.closest("form"));
    await waitFor(() => expect(actions.submitSignup).toHaveBeenCalledTimes(1));
    const { dogs } = actions.submitSignup.mock.calls[0][0];
    expect(dogs[0].dob).toBeNull();
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
    actions.lookupAddress.mockResolvedValue({
      error: { context: new Response(JSON.stringify({ error: "upstream" }), { status: 502 }) },
    });
    renderForm();
    change("Search for your address", "1 Example Road, Example Town");
    fireEvent.click(screen.getByRole("button", { name: "Find address" }));
    expect(await screen.findByText(/Couldn't search just now/)).toBeInTheDocument();
    fillOwner();
    attemptContinue();
    expect(screen.getByRole("heading", { name: "About your dog" })).toBeInTheDocument();
  });

  it("offers a real manual-entry button when no suggestions are found for the search", async () => {
    actions.lookupAddress.mockResolvedValue({ data: { postcode: "SK14 6JE", addresses: [] }, error: null });
    renderForm();
    change("Search for your address", "1 Example Road, SK14 6JE");
    fireEvent.click(screen.getByRole("button", { name: "Find address" }));
    expect(await screen.findByText(/No address suggestions found/)).toBeInTheDocument();
    const manual = screen.getByRole("button", { name: "Enter it manually instead" });
    expect(manual).toHaveClass("portal-btn");
    expect(screen.queryByRole("button", { name: /Can't find your address/ })).not.toBeInTheDocument();
    fireEvent.click(manual);
    expect(screen.getByLabelText("Full address")).toBeInTheDocument();
    expect(screen.getByLabelText("Postcode")).toHaveValue("SK14 6JE");
  });
});
