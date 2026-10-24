import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { TrustedHumansSection } from "./TrustedHumansSection.jsx";

const existingContact = {
  id: "trusted-1",
  name: "Jess",
  surname: "Harper",
  phone: "+44 7700 900123",
  relationship: "Neighbour",
};

describe("TrustedHumansSection", () => {
  it("keeps existing contacts visible without offering customer creation", () => {
    render(
      <ToastProvider>
        <TrustedHumansSection trustedHumans={[existingContact]} />
      </ToastProvider>,
    );

    expect(screen.getByText("Jess Harper")).toBeInTheDocument();
    expect(screen.getByText("Neighbour")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Adding a trusted human online is temporarily unavailable.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /add a trusted human/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /first name/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /mobile number/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The list is only meaningful once its own read has succeeded. While it is
  // in flight or after it failed, an empty card would read as "you have no
  // trusted humans" to someone who has several.
  it("says it is still fetching while the read is in flight", () => {
    render(<TrustedHumansSection trustedHumans={[]} status="loading" />);

    expect(screen.getByText(/fetching your trusted humans/i)).toBeInTheDocument();
    expect(
      screen.queryByText("Adding a trusted human online is temporarily unavailable."),
    ).not.toBeInTheDocument();
  });

  it("owns a failed read with its own retry instead of looking empty", () => {
    const onRetry = vi.fn();
    render(
      <TrustedHumansSection trustedHumans={[]} status="error" onRetry={onRetry} />,
    );

    expect(
      screen.getByText(/couldn.t load your trusted humans/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Adding a trusted human online is temporarily unavailable."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
