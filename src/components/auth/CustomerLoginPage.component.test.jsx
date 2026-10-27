// The customer login page's fail-closed behaviour. The missing-token guard
// already existed here; what is new is that a deploy with no Turnstile site
// key renders no challenge at all rather than one that always passes.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  turnstileConfig: { siteKey: "0xTEST", configError: null, usingTestKey: false },
}));

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess, onError, onExpire }) => (
    <div>
      <button type="button" onClick={() => onSuccess("solved-token")}>solve captcha</button>
      <button type="button" onClick={() => onError("200100")}>clock error</button>
      <button type="button" onClick={() => onError("200500")}>network error</button>
      <button type="button" onClick={onExpire}>expire captcha</button>
    </div>
  ),
}));

vi.mock("../../lib/turnstile", async (importOriginal) => ({
  ...await importOriginal(),
  get turnstileConfig() { return mocks.turnstileConfig; },
}));

import { CustomerLoginPage } from "./CustomerLoginPage.jsx";

// The page's full prop set. otpSent false keeps it on the phone stage, which
// is the one that renders the shared turnstilePanel first.
function renderPage() {
  return render(
    <CustomerLoginPage
      onCheckPhone={vi.fn(async () => ({ on_file: true, has_password: true }))}
      onSendOtp={vi.fn(async () => ({}))}
      onSignInWithPassword={vi.fn(async () => ({}))}
      onVerifyOtp={vi.fn(async () => ({}))}
      onResetOtp={vi.fn(async () => ({}))}
      otpSent={false}
      phone=""
      error=""
    />,
  );
}

beforeEach(() => {
  mocks.turnstileConfig = {
    siteKey: "0xTEST",
    configError: null,
    usingTestKey: false,
  };
});

describe("CustomerLoginPage captcha handling", () => {
  it("renders the challenge when a site key is configured", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: "solve captcha" }),
    ).toBeInTheDocument();
  });

  it("renders no challenge and disables the form when no site key is configured", () => {
    mocks.turnstileConfig = {
      siteKey: null,
      configError: "Missing VITE_TURNSTILE_SITE_KEY",
      usingTestKey: false,
    };
    renderPage();

    expect(
      screen.queryByRole("button", { name: "solve captcha" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Signing in is unavailable right now"),
    ).toBeInTheDocument();
    // "Continue" is the phone stage's submit; the signup and password stages
    // render their own, disabled by the same captchaUnavailable flag. Those
    // stages are unreachable in this state anyway: the phone-stage Continue is
    // disabled, and it is the only way through to them.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

describe("CustomerLoginPage widget failure feedback", () => {
  it("replaces reassurance with time guidance and preserves the entered number", () => {
    renderPage();
    const phone = screen.getByLabelText("Mobile number");
    fireEvent.change(phone, { target: { value: "7700900123" } });
    fireEvent.click(screen.getByRole("button", { name: "clock error" }));
    expect(screen.getByRole("alert", { name: "Security check" })).toHaveTextContent("date and time are set automatically");
    expect(screen.queryByText(/no clicks needed/)).not.toBeInTheDocument();
    expect(phone).toHaveValue("7700900123");
    fireEvent.click(screen.getByRole("button", { name: "solve captcha" }));
    expect(screen.queryByRole("alert", { name: "Security check" })).not.toBeInTheDocument();
    expect(screen.getByText("Security check complete.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "expire captcha" }));
    expect(screen.queryByText("Security check complete.")).not.toBeInTheDocument();
  });
});
