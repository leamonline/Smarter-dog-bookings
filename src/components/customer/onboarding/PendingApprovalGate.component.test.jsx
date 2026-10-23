import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingApprovalGate } from "./PendingApprovalGate.jsx";

describe("PendingApprovalGate", () => {
  it("shows the plain review copy for an ordinary signup", () => {
    render(<PendingApprovalGate onRefresh={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /you're on the list/i })).toBeInTheDocument();
    expect(screen.getByText(/check everything over/i)).toBeInTheDocument();
    expect(screen.queryByText(/already know you/i)).toBeNull();
  });

  it("explains the link, not an approval, when the signup claims an existing customer", () => {
    render(<PendingApprovalGate claimsExisting onRefresh={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /already know you/i })).toBeInTheDocument();
    expect(screen.getByText(/link this login to your existing record/i)).toBeInTheDocument();
    expect(screen.getByText(/you don't need to do anything/i)).toBeInTheDocument();
    expect(screen.queryByText(/first appointment/i)).toBeNull();
  });

  // Owner decision (23 October 2026, #1073): say when reviews usually happen,
  // without a deadline the salon could miss during a holiday closure.
  it.each([
    ["an ordinary signup", false],
    ["a signup claiming an existing customer", true],
  ])("tells %s roughly when the team looks, without a firm promise", (_label, claimsExisting) => {
    render(
      <PendingApprovalGate claimsExisting={claimsExisting} onRefresh={vi.fn()} onSignOut={vi.fn()} />,
    );
    const body = document.body.textContent;
    expect(body).toMatch(/usually .*salon days, Monday to Wednesday/i);
    expect(body).not.toMatch(/within|working day|hours|guarantee/i);
  });

  it.each([
    ["an ordinary signup", false],
    ["a signup claiming an existing customer", true],
  ])("gives %s a WhatsApp route for questions while they wait", (_label, claimsExisting) => {
    render(
      <PendingApprovalGate claimsExisting={claimsExisting} onRefresh={vi.fn()} onSignOut={vi.fn()} />,
    );
    const link = screen.getByRole("link", { name: /message us on whatsapp/i });
    expect(link).toHaveAttribute("href", "https://wa.me/447873329440");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("keeps Check again and Sign out in both variants", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onSignOut = vi.fn();
    render(<PendingApprovalGate claimsExisting onRefresh={onRefresh} onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
