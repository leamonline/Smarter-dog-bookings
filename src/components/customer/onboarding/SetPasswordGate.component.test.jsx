import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

function setSupabase(value) {
  globalThis.__setPasswordGateSupabase = value;
}

vi.mock("../../../supabase/customerClient", () => ({
  get customerSupabase() {
    return globalThis.__setPasswordGateSupabase;
  },
}));

// The gate's own HaveIBeenPwned check is a network call; pin it to "clean" so
// these tests exercise the server-side outcomes, not the local pre-check.
vi.mock("../../../utils/pwnedPassword", () => ({
  isPasswordPwned: vi.fn(async () => false),
}));

const { SetPasswordGate } = await import("./SetPasswordGate.jsx");

function renderGate(props = {}) {
  return render(
    <ToastProvider>
      <SetPasswordGate username="+447700900111" onComplete={vi.fn()} onSignOut={vi.fn()} {...props} />
    </ToastProvider>,
  );
}

async function submitPassword(pw) {
  fireEvent.change(screen.getByLabelText(/^(New password|Password)$/), { target: { value: pw } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: pw } });
  fireEvent.click(screen.getByRole("button", { name: /Set password|Save new password/ }));
}

describe("SetPasswordGate", () => {
  beforeEach(() => {
    setSupabase({ auth: { updateUser: vi.fn(async () => ({ error: null })) } });
  });

  it("explains a breach-forced reset in plain words", () => {
    renderGate({ mode: "reset", reason: "breach" });
    expect(screen.getByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(
      screen.getByText(/appeared in a known data breach, so it isn't safe to keep/),
    ).toBeInTheDocument();
  });

  it("keeps the ordinary reset copy when there is no breach reason", () => {
    renderGate({ mode: "reset" });
    expect(screen.getByText(/Choose a new password/)).toBeInTheDocument();
    expect(screen.queryByText(/data breach/)).toBeNull();
  });

  it("turns the server's weak_password rejection into the same friendly message as the local check", async () => {
    setSupabase({
      auth: {
        updateUser: vi.fn(async () => ({
          error: { code: "weak_password", message: "Password is known to be weak and easy to guess, please choose a different one." },
        })),
      },
    });
    renderGate();
    await submitPassword("correct horse battery");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That password has appeared in a known data breach, so it isn't safe to use. Please choose a different one.",
      ),
    );
  });

  it("surfaces any other server message verbatim", async () => {
    setSupabase({
      auth: {
        updateUser: vi.fn(async () => ({
          error: { code: "validation_failed", message: "Password should be at least 12 characters." },
        })),
      },
    });
    renderGate();
    await submitPassword("only-eight");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Password should be at least 12 characters."),
    );
  });
});
