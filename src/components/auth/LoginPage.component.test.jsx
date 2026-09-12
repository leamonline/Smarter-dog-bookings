// The staff login page's captcha behaviour, which is invisible until Supabase
// CAPTCHA protection is switched on and then decides whether anyone can sign
// in at all. Two things are pinned: a deploy with no site key blocks sign-in
// rather than showing a challenge that always passes, and a submit before the
// widget has produced a token is caught here rather than by Supabase (which
// answers with a raw "captcha protection: request disallowed").
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.mock factories are hoisted above the file's own consts, so anything they
// close over has to come from vi.hoisted.
const mocks = vi.hoisted(() => ({
  turnstileConfig: { siteKey: "0xTEST", configError: null, usingTestKey: false },
  requestPasswordReset: vi.fn(async () => ({ error: null })),
}));

// The real widget injects Cloudflare's challenge script, which jsdom cannot
// run. This stand-in hands back a token only when clicked, which is exactly
// the distinction under test: resolved versus not yet resolved.
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

vi.mock("../../supabase/hooks/useStaffAuthActions", () => ({
  useStaffAuthActions: () => ({
    requestPasswordReset: mocks.requestPasswordReset,
  }),
}));

import { LoginPage } from "./LoginPage.jsx";

beforeEach(() => {
  mocks.turnstileConfig = {
    siteKey: "0xTEST",
    configError: null,
    usingTestKey: false,
  };
  mocks.requestPasswordReset.mockClear();
});

async function fillCredentials(user) {
  await user.type(screen.getByLabelText("Email"), "staff@smarterdog.co.uk");
  await user.type(screen.getByLabelText("Password"), "correct-horse");
}

describe("LoginPage captcha handling", () => {
  it("signs in with the token once the widget has resolved", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn(async () => ({ error: null }));
    render(<LoginPage onSignIn={onSignIn} error="" isOffline={false} />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "solve captcha" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSignIn).toHaveBeenCalledWith(
      "staff@smarterdog.co.uk",
      "correct-horse",
      "solved-token",
    );
  });

  it("refuses to submit before the widget has produced a token", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn(async () => ({ error: null }));
    render(<LoginPage onSignIn={onSignIn} error="" isOffline={false} />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSignIn).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Just finishing the security check — please try again in a moment.",
      ),
    ).toBeInTheDocument();
  });

  it("refuses a password reset before the widget has produced a token", async () => {
    const user = userEvent.setup();
    render(<LoginPage onSignIn={vi.fn()} error="" isOffline={false} />);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "staff@smarterdog.co.uk");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("blocks sign-in and renders no widget when no site key is configured", async () => {
    mocks.turnstileConfig = {
      siteKey: null,
      configError: "Missing VITE_TURNSTILE_SITE_KEY",
      usingTestKey: false,
    };
    const onSignIn = vi.fn(async () => ({ error: null }));
    render(<LoginPage onSignIn={onSignIn} error="" isOffline={false} />);

    // No challenge at all, rather than one that always passes.
    expect(
      screen.queryByRole("button", { name: "solve captcha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByText("Sign-in is unavailable right now")).toBeInTheDocument();
  });
});
