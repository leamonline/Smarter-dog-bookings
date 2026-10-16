// HumanHeader — the WhatsApp opt-out badge, and the "WA" wa.me link that is
// hidden while WhatsApp is switched off (a chat from a staff phone would go
// round every send-time check).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HumanHeader } from "./HumanHeader.jsx";

const sarah = {
  id: "h1",
  name: "Sarah",
  surname: "Jones",
  fullName: "Sarah Jones",
  phone: "07700 900123",
  whatsapp: true,
};

function renderHeader(human) {
  render(
    <HumanHeader
      human={human}
      humanFullName={human.fullName}
      isEditing={false}
      onStartEdit={() => {}}
      onClose={() => {}}
      canEdit={false}
      onCopyPhone={() => {}}
      overflowItems={[]}
      nameInputRef={{ current: null }}
      isPendingSignup={false}
    />,
  );
}

const waLink = () => screen.queryByRole("link", { name: "Message 07700 900123 on WhatsApp" });

describe("HumanHeader — WhatsApp opt-out", () => {
  it("badges a STOP, with when it happened", () => {
    renderHeader({
      ...sarah,
      whatsappOptedOut: true,
      whatsappOptedOutAt: "2026-10-03T13:05:00.123456+00:00",
      whatsappOptedOutReason: "asked_on_whatsapp",
    });
    const badge = screen.getByText("WhatsApp stopped");
    expect(badge).toHaveAttribute("title", "Said STOP on WhatsApp · 3 Oct 2026, 14:05");
    expect(screen.queryByText("WhatsApp off")).toBeNull();
  });

  it("badges any other opt-out", () => {
    renderHeader({
      ...sarah,
      whatsappOptedOut: true,
      whatsappOptedOutAt: null,
      whatsappOptedOutReason: "Asked by phone",
    });
    const badge = screen.getByText("WhatsApp off");
    expect(badge).toHaveAttribute(
      "title",
      "WhatsApp switched off · Switched off: Asked by phone · since date not recorded",
    );
    expect(screen.queryByText("WhatsApp stopped")).toBeNull();
  });

  it("shows no badge while WhatsApp is on", () => {
    renderHeader({ ...sarah, whatsappOptedOut: false });
    expect(screen.queryByText("WhatsApp stopped")).toBeNull();
    expect(screen.queryByText("WhatsApp off")).toBeNull();
  });

  it("hides the WA link while WhatsApp is switched off, and shows it otherwise", () => {
    renderHeader({ ...sarah, whatsappOptedOut: true, whatsappOptedOutReason: "asked_on_whatsapp" });
    expect(waLink()).toBeNull();
    // The call action stays: the phone itself is not opted out.
    expect(screen.getByRole("link", { name: "Call 07700 900123" })).toBeInTheDocument();
  });

  it("keeps the WA link for a customer who has not opted out", () => {
    renderHeader({ ...sarah, whatsappOptedOut: false });
    expect(waLink()).toBeInTheDocument();
  });
});
