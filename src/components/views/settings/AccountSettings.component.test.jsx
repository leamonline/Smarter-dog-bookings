import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountSettings } from "./AccountSettings.jsx";

vi.mock("./DeviceNotifications.jsx", () => ({ DeviceNotifications: () => null }));
vi.mock("../../../supabase/repositories/accountRepo", () => ({
  isAccountBackendAvailable: () => false,
  updateStaffProfile: vi.fn(),
  updateAccountEmail: vi.fn(),
}));

describe("account password reset guidance", () => {
  it("directs staff to the protected reset flow without an unusable send action", () => {
    render(<AccountSettings user={{ email: "staff@example.com" }} staffProfile={{}} />);
    expect(screen.getByText(/Save any changes, then sign out/)).toHaveTextContent(
      /Forgot password.*staff sign-in page.*Complete the security check/,
    );
    expect(screen.queryByRole("button", { name: /reset|sending|link sent/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
});
