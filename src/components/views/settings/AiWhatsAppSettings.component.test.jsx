import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAiWhatsAppSetting = vi.fn();
const setAiWhatsAppEnabled = vi.fn();
vi.mock("../../../supabase/repositories/aiMessagingRepo", () => ({
  isAiMessagingBackendAvailable: () => true,
  getAiWhatsAppSetting,
  setAiWhatsAppEnabled,
}));

const { AiWhatsAppSettings } = await import("./AiWhatsAppSettings.jsx");

describe("AiWhatsAppSettings", () => {
  beforeEach(() => {
    getAiWhatsAppSetting.mockReset();
    setAiWhatsAppEnabled.mockReset();
  });

  it("loads the durable switch and saves a staff change", async () => {
    getAiWhatsAppSetting.mockResolvedValueOnce({
      data: [{ enabled: true }],
      error: null,
    });
    setAiWhatsAppEnabled.mockResolvedValueOnce({
      data: [{ enabled: false }],
      error: null,
    });

    render(<AiWhatsAppSettings />);
    const control = await screen.findByRole("switch", {
      name: "Allow automatic AI WhatsApp messages",
    });
    // findByRole resolves as soon as the switch EXISTS, and it renders with
    // enabled=false/loading=true before the durable read resolves. Asserting
    // straight away therefore races the load: it passes on a fast machine and
    // fails on a loaded CI runner, which is exactly what happened. Wait for the
    // loaded state instead of the element's mere presence.
    await waitFor(() =>
      expect(control).toHaveAttribute("aria-checked", "true"),
    );

    fireEvent.click(control);
    await waitFor(() =>
      expect(setAiWhatsAppEnabled).toHaveBeenLastCalledWith(false),
    );
    // Same reasoning: the attribute flips when the save resolves, not when the
    // call is made.
    await waitFor(() =>
      expect(control).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("shows the fail-closed state when the setting cannot be read", async () => {
    getAiWhatsAppSetting.mockResolvedValueOnce({
      data: null,
      error: { message: "read failed" },
    });

    render(<AiWhatsAppSettings />);
    expect(
      await screen.findByText(/automatic AI WhatsApp messages are blocked/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: "Allow automatic AI WhatsApp messages",
      }),
    ).toBeDisabled();
  });
});
