// The inbox thread's "WhatsApp is off" banner. Tests run offline, so the
// real dialog opens on its sample-data state; a pass-through spy records the
// props the banner hands it.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../contexts/ToastContext.jsx";

const dialogSpy = vi.hoisted(() => ({ props: [] }));

vi.mock("../../../modals/whatsapp-reenable/ReenableWhatsAppDialog.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  const Real = actual.ReenableWhatsAppDialog;
  return {
    ReenableWhatsAppDialog: (props) => {
      dialogSpy.props.push(props);
      return <Real {...props} />;
    },
  };
});

const { NumberStoppedBanner, isThreadWhatsappStopped } = await import("./NumberStoppedBanner.jsx");

const FIRST = "2026-10-03T13:05:00.000000+00:00";
const LATEST = "2026-10-10T08:12:00.000000+00:00";

const unknownNumber = {
  id: "conv-stopped",
  channel: "whatsapp",
  phone_e164: "+447700900199",
  human_id: null,
  humans: null,
  whatsapp_opted_out_at: FIRST,
  whatsapp_last_stop_at: LATEST,
};

const linked = {
  id: "conv-sarah",
  channel: "whatsapp",
  phone_e164: "+447700900123",
  human_id: "human-1",
  whatsapp_opted_out_at: null,
  whatsapp_last_stop_at: null,
  humans: {
    name: "sarah",
    surname: "jones",
    phone: "07700 900123",
    whatsapp_opted_out: true,
    whatsapp_opted_out_at: "2026-12-01T09:00:00+00:00",
    whatsapp_opted_out_reason: "Asked by phone",
  },
};

function renderBanner(conversation, props = {}) {
  return render(
    <ToastProvider>
      <NumberStoppedBanner conversation={conversation} {...props} />
    </ToastProvider>,
  );
}

const reenableButton = () => screen.queryByRole("button", { name: "Switch WhatsApp back on…" });

beforeEach(() => {
  dialogSpy.props = [];
});

describe("NumberStoppedBanner", () => {
  it("says when the number said STOP, and again", () => {
    renderBanner(unknownNumber, { onReenabled: vi.fn() });
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(
      "This number said STOP on 3 Oct 2026, 14:05. It said STOP again on 10 Oct 2026, 09:12.",
    );
    expect(banner).toHaveTextContent(
      "Nothing can be sent to it on WhatsApp — replies, templates and reminders are all blocked — until the customer gives permission again.",
    );
    expect(banner.className).toMatch(/rose/);
    expect(reenableButton()).toBeInTheDocument();
  });

  it("leaves out the repeat when there was only one STOP", () => {
    renderBanner({ ...unknownNumber, whatsapp_last_stop_at: FIRST });
    expect(screen.getByRole("status")).toHaveTextContent("This number said STOP on 3 Oct 2026, 14:05. Nothing can");
    expect(screen.queryByText(/STOP again/)).toBeNull();
  });

  it("names a linked customer switched off on this number", () => {
    renderBanner(linked, { onReenabled: vi.fn() });
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("WhatsApp is switched off for Sarah Jones.");
    expect(banner).toHaveTextContent(
      "Switched off: Asked by phone · since 1 Dec 2026, 09:00. Nothing can be sent in this chat until it’s switched back on.",
    );
    expect(banner.className).toMatch(/slate/);
    expect(reenableButton()).toBeInTheDocument();
  });

  it("points to the profile of a linked customer saved with another number", () => {
    const onOpenHuman = vi.fn();
    const otherNumber = { ...linked, humans: { ...linked.humans, phone: "07700 900999" } };
    renderBanner(otherNumber, { onReenabled: vi.fn(), onOpenHuman });
    expect(screen.getByRole("status")).toHaveTextContent(
      "This chat is linked to them, but their record has a different number, so sends here are blocked too. Review it on their profile.",
    );
    expect(reenableButton()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Sarah Jones’s profile" }));
    expect(onOpenHuman).toHaveBeenCalledWith("human-1");
  });

  it("calls an unnamed linked customer 'the linked customer', never the chat's number", () => {
    const onOpenHuman = vi.fn();
    const unnamed = { ...linked, humans: { ...linked.humans, name: "", surname: "" } };
    const { unmount } = renderBanner(unnamed, { onReenabled: vi.fn() });
    expect(screen.getByRole("status")).toHaveTextContent("WhatsApp is switched off for the linked customer.");
    expect(screen.getByRole("status")).not.toHaveTextContent(/07700|900123/);
    unmount();

    renderBanner({ ...unnamed, humans: { ...unnamed.humans, phone: "07700 900555" } }, { onOpenHuman });
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("WhatsApp is switched off for the linked customer.");
    expect(banner).not.toHaveTextContent(/07700|900123/);
    fireEvent.click(screen.getByRole("button", { name: "Open their profile" }));
    expect(onOpenHuman).toHaveBeenCalledWith("human-1");
  });

  it("treats a name and surname of only spaces as no name at all", () => {
    const onOpenHuman = vi.fn();
    const blank = { ...linked, humans: { ...linked.humans, name: " ", surname: "  " } };
    const { unmount } = renderBanner(blank, { onReenabled: vi.fn() });
    expect(screen.getByRole("status")).toHaveTextContent("WhatsApp is switched off for the linked customer.");
    unmount();

    renderBanner({ ...blank, humans: { ...blank.humans, phone: "07700 900555" } }, { onOpenHuman });
    expect(screen.getByRole("status")).toHaveTextContent("WhatsApp is switched off for the linked customer.");
    fireEvent.click(screen.getByRole("button", { name: "Open their profile" }));
    expect(onOpenHuman).toHaveBeenCalledWith("human-1");
  });

  it("hands the dialog no name for a blank-named linked customer saved elsewhere", () => {
    renderBanner(
      {
        ...linked,
        whatsapp_opted_out_at: FIRST,
        whatsapp_last_stop_at: FIRST,
        humans: { ...linked.humans, name: " ", surname: "  ", phone: "07700 900999" },
      },
      { onReenabled: vi.fn() },
    );
    fireEvent.click(reenableButton());
    expect(dialogSpy.props.at(-1).linkedElsewhere).toEqual({ id: "human-1", name: null });
  });

  it("names a linked customer from their record, title-cased, surname only if that is all there is", () => {
    renderBanner({ ...linked, humans: { ...linked.humans, name: "", surname: "jones" } }, { onReenabled: vi.fn() });
    expect(screen.getByRole("status")).toHaveTextContent("WhatsApp is switched off for Jones.");
  });

  it("hands the dialog no name for an unnamed linked customer saved elsewhere", () => {
    const stoppedAndUnnamedElsewhere = {
      ...linked,
      whatsapp_opted_out_at: FIRST,
      whatsapp_last_stop_at: FIRST,
      humans: { ...linked.humans, name: "", surname: "", phone: "07700 900999" },
    };
    renderBanner(stoppedAndUnnamedElsewhere, { onReenabled: vi.fn() });
    fireEvent.click(reenableButton());
    expect(dialogSpy.props.at(-1).linkedElsewhere).toEqual({ id: "human-1", name: null });
  });

  it("shows the status with no buttons when no handlers are passed (Booking Desk)", () => {
    renderBanner(unknownNumber);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(reenableButton()).toBeNull();
    renderBanner({ ...linked, humans: { ...linked.humans, phone: null } });
    expect(screen.queryByRole("button", { name: /profile/ })).toBeNull();
  });

  it("opens the dialog on the chat's own number when there is no customer record", () => {
    const onReenabled = vi.fn();
    renderBanner(unknownNumber, { onReenabled });
    fireEvent.click(reenableButton());

    expect(screen.getByRole("dialog", { name: "Switch WhatsApp back on?" })).toBeInTheDocument();
    expect(dialogSpy.props.at(-1)).toMatchObject({
      phone: "+447700900199",
      context: "inbox",
      currentHumanId: null,
      observedLastStopAt: LATEST,
      linkedElsewhere: null,
      onReenabled,
    });
  });

  it("tells the dialog about a linked customer saved under another number", () => {
    const stoppedAndLinkedElsewhere = {
      ...linked,
      whatsapp_opted_out_at: FIRST,
      whatsapp_last_stop_at: FIRST,
      humans: { ...linked.humans, phone: "07700 900999" },
    };
    renderBanner(stoppedAndLinkedElsewhere, { onReenabled: vi.fn() });
    fireEvent.click(reenableButton());
    expect(dialogSpy.props.at(-1)).toMatchObject({
      phone: "+447700900123",
      currentHumanId: "human-1",
      linkedElsewhere: { id: "human-1", name: "Sarah Jones" },
    });
  });

  it("renders nothing for an SMS thread or a chat with nothing switched off", () => {
    const { container } = renderBanner({ ...unknownNumber, channel: "sms" });
    expect(container).toBeEmptyDOMElement();
    expect(isThreadWhatsappStopped({ ...unknownNumber, channel: "sms" })).toBe(false);
    expect(isThreadWhatsappStopped({ ...linked, humans: { ...linked.humans, whatsapp_opted_out: false } })).toBe(false);
    expect(isThreadWhatsappStopped(null)).toBe(false);
    expect(isThreadWhatsappStopped(unknownNumber)).toBe(true);
  });
});
