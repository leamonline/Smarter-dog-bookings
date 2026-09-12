// The customer login page's fail-closed behaviour. The missing-token guard
// already existed here; what is new is that a deploy with no Turnstile site
// key renders no challenge at all rather than one that always passes.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  turnstileConfig: { siteKey: "0xTEST", configError: null, usingTestKey: false },
}));

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess("solved-token")}>
      solve captcha
    </button>
  ),
}));

vi.mock("../../lib/turnstile", () => ({
  get turnstileConfig() {
    return mocks.turnstileConfig;
  },
  CAPTCHA_PENDING_ERROR:
    "Just finishing the security check — please try again in a moment.",
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
    // render their own, which Step 5 disables the same way.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
