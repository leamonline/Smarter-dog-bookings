import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiMessagingPanel } from "./AiMessagingPanel.jsx";

describe("AiMessagingPanel", () => {
  it("defaults existing customers to allowed and explains the global override", () => {
    render(
      <AiMessagingPanel
        human={{ id: "h1", aiWhatsappAllowed: undefined }}
        onUpdateHuman={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("switch", {
        name: "Allow AI-initiated WhatsApp messages",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/when the salon switch is on/i)).toBeInTheDocument();
  });

  it("blocks only AI-initiated messages and preserves manual staff messaging", () => {
    const onUpdateHuman = vi.fn();
    render(
      <AiMessagingPanel
        human={{ id: "h1", aiWhatsappAllowed: true }}
        onUpdateHuman={onUpdateHuman}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Allow AI-initiated WhatsApp messages",
      }),
    );
    expect(onUpdateHuman).toHaveBeenCalledWith("h1", {
      aiWhatsappAllowed: false,
    });
    expect(screen.getByText(/staff can still message them manually/i)).toBeInTheDocument();
  });
});
