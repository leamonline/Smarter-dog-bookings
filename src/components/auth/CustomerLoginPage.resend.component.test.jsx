import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerLoginPage } from "./CustomerLoginPage.jsx";

const config = vi.hoisted(() => ({ siteKey: "test", configError: null }));
vi.mock("../../lib/turnstile", () => ({ turnstileConfig: config, CAPTCHA_PENDING_ERROR: "Complete the security check." }));
vi.mock("@marsidev/react-turnstile", () => ({ Turnstile: ({ onSuccess }) => <button type="button" onClick={() => onSuccess("fresh-token")}>Solve</button> }));

beforeEach(() => { vi.useFakeTimers(); config.configError = null; });
afterEach(() => vi.useRealTimers());

function setup(mode = "login", send = vi.fn(async () => ({}))) {
  const verify = vi.fn(async () => ({}));
  function Harness() {
    const [sent, setSent] = useState(false);
    return <CustomerLoginPage phone="+447700900123" otpSent={sent} error=""
      onCheckPhone={async () => ({ on_file: mode !== "signup", has_password: mode === "reset" })}
      onSendOtp={async token => { const result = await send(token); if (!result?.error) setSent(true); return result; }}
      onVerifyOtp={verify} onResetOtp={() => setSent(false)} onSignInWithPassword={vi.fn()} />;
  }
  render(<Harness />);
  return { send, verify };
}
async function enterCodeStage(mode) {
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "7700900123" } });
  fireEvent.click(screen.getByText("Solve"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
  if (mode !== "login") {
    fireEvent.click(screen.getByText("Solve"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: mode === "reset" ? /Forgotten/ : /Join the Pack/ })));
  }
}
describe("code resend", () => {
  it.each(["login", "signup", "reset"])("preserves %s intent, cooldown and fresh CAPTCHA", async mode => {
    const { send, verify } = setup(mode);
    await enterCodeStage(mode);
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(60000));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resend code" })));
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Complete the security check.");
    fireEvent.click(screen.getByText("Solve"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resend code" })));
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("A new code has been sent.");
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign in" })));
    expect(verify).toHaveBeenCalledWith("123456", { isReset: mode === "reset" });
  });
  it("consumes the token on failed resend and preserves the entered code", async () => {
    const send = vi.fn().mockResolvedValueOnce({}).mockResolvedValue({ error: "rate limited" });
    setup("login", send); await enterCodeStage("login");
    await act(async () => vi.advanceTimersByTime(60000));
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByText("Solve"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resend code" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resend code" })));
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("6-digit code")).toHaveValue("654321");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
  it("allows verification when resend CAPTCHA is unavailable", () => {
    config.configError = "missing";
    render(<CustomerLoginPage otpSent phone="+447700900123" onVerifyOtp={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Resend code/ })).toBeDisabled();
  });
});
