// HumanHeader — the pending-signup controls when the signup claims to be an
// existing customer: "Link to <name>" replaces Approve, Reject stays.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HumanHeader } from "./HumanHeader.jsx";

const shell = {
  id: "h-shell",
  name: "New member",
  surname: "Pending 7399567445",
  fullName: "New member Pending 7399567445",
  phone: "+447399567445",
};

function renderHeader(props = {}) {
  const onApproveSignup = vi.fn();
  const onRejectSignup = vi.fn();
  const onLinkClaimedSignup = vi.fn();
  render(
    <HumanHeader
      human={shell}
      humanFullName={shell.fullName}
      isEditing={false}
      draft={{}}
      setDraftField={() => {}}
      onStartEdit={() => {}}
      onClose={() => {}}
      canEdit={false}
      onCopyPhone={() => {}}
      overflowItems={[]}
      nameInputRef={{ current: null }}
      isPendingSignup
      signupBusy={false}
      onApproveSignup={onApproveSignup}
      onRejectSignup={onRejectSignup}
      onLinkClaimedSignup={onLinkClaimedSignup}
      {...props}
    />,
  );
  return { onApproveSignup, onRejectSignup, onLinkClaimedSignup };
}

describe("HumanHeader — pending signup that claims an existing customer", () => {
  it("offers Approve + Reject for an ordinary pending signup", () => {
    renderHeader({ claimedHuman: null });
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /link to/i })).toBeNull();
    expect(screen.queryByText(/existing customer/i)).toBeNull();
  });

  it("swaps Approve for 'Link to <name>' and names the claimed record", () => {
    const { onLinkClaimedSignup, onApproveSignup } = renderHeader({
      claimedHuman: { id: "h-clare", name: "clare", surname: "duncan" },
    });
    expect(screen.getByText(/says they're an existing customer/i)).toBeInTheDocument();
    expect(screen.getByText("Clare Duncan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /link to clare duncan/i }));
    expect(onLinkClaimedSignup).toHaveBeenCalledTimes(1);
    expect(onApproveSignup).not.toHaveBeenCalled();
    // Rejecting a mistaken claim is still available.
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("disables the link button while a signup action is in flight", () => {
    renderHeader({
      claimedHuman: { id: "h-clare", fullName: "Clare Duncan" },
      signupBusy: true,
    });
    expect(screen.getByRole("button", { name: /linking/i })).toBeDisabled();
  });
});
