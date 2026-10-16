// The profile's "WhatsApp is off" notice. Tests run offline (no client), so
// the real dialog opens on its sample-data state; a pass-through spy records
// the props the notice hands it.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const dialogSpy = vi.hoisted(() => ({ props: [] }));

vi.mock("../whatsapp-reenable/ReenableWhatsAppDialog.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  const Real = actual.ReenableWhatsAppDialog;
  return {
    ReenableWhatsAppDialog: (props) => {
      dialogSpy.props.push(props);
      return <Real {...props} />;
    },
  };
});

const { WhatsAppStopNotice } = await import("./WhatsAppStopNotice.jsx");

const human = {
  id: "human-1",
  fullName: "sarah jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700 900123",
  whatsapp: true,
  whatsappOptedOut: true,
  whatsappOptedOutAt: "2026-10-03T13:05:00.123456+00:00",
  whatsappOptedOutReason: "asked_on_whatsapp",
};

function renderNotice(overrides = {}, props = {}) {
  const onReenabled = vi.fn();
  const onOpenHuman = vi.fn();
  const subject = { ...human, ...overrides };
  const tree = (h) => (
    <ToastProvider>
      <WhatsAppStopNotice human={h} onOpenHuman={onOpenHuman} onReenabled={onReenabled} {...props} />
    </ToastProvider>
  );
  const view = render(tree(subject));
  return { ...view, onReenabled, onOpenHuman, rerenderWith: (h) => view.rerender(tree(h)) };
}

const reenableButton = () => screen.queryByRole("button", { name: "Switch WhatsApp back on…" });

beforeEach(() => {
  dialogSpy.props = [];
});

describe("WhatsAppStopNotice", () => {
  it("renders nothing while WhatsApp is on", () => {
    const { container } = renderNotice({ whatsappOptedOut: false });
    expect(container).toBeEmptyDOMElement();
    renderNotice({ whatsappOptedOut: undefined });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says the customer said STOP, in salon time", () => {
    renderNotice();
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("WhatsApp is off — they said STOP.");
    expect(notice).toHaveTextContent(
      "On 3 Oct 2026, 14:05. Nothing can be sent to this number on WhatsApp — replies, templates or reminders — until they give permission again.",
    );
    expect(notice.className).toMatch(/rose/);
    expect(reenableButton()).toBeInTheDocument();
  });

  it("names any other reason, and a missing one", () => {
    renderNotice({ whatsappOptedOutReason: "Asked by phone", whatsappOptedOutAt: "2026-12-01T09:00:00+00:00" });
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("WhatsApp is switched off for this customer.");
    expect(notice).toHaveTextContent(
      "Switched off: Asked by phone · since 1 Dec 2026, 09:00. Nothing can be sent to this number on WhatsApp until it’s switched back on.",
    );
    expect(notice.className).toMatch(/slate/);
  });

  it("copes with no reason and no time", () => {
    renderNotice({ whatsappOptedOutReason: null, whatsappOptedOutAt: null });
    expect(screen.getByRole("status")).toHaveTextContent("No reason recorded · since date not recorded.");
  });

  it("explains a record with no phone, and offers no button", () => {
    renderNotice({ phone: "   " });
    expect(screen.getByRole("status")).toHaveTextContent(
      "There’s no phone number on this record, so WhatsApp can’t be switched back on from here. Add their number first.",
    );
    expect(reenableButton()).toBeNull();
  });

  it("opens the dialog, which explains it needs the live database", () => {
    renderNotice();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(reenableButton());
    expect(screen.getByRole("dialog", { name: "Switch WhatsApp back on?" })).toBeInTheDocument();
    expect(
      screen.getByText("Switching WhatsApp back on needs the live database — you’re on sample data. Nothing has been changed."),
    ).toBeInTheDocument();
  });

  it("hands the dialog this customer's number and forwards the ids it switched back on", () => {
    const { onReenabled, onOpenHuman } = renderNotice();
    fireEvent.click(reenableButton());
    const props = dialogSpy.props.at(-1);
    expect(props).toMatchObject({
      phone: "07700 900123",
      context: "profile",
      currentHumanId: "human-1",
      currentHumanName: "Sarah Jones",
      onOpenHuman,
    });
    props.onReenabled({ humanIds: ["human-1", "human-2"], conversationIds: ["c1"], auditId: "a1" });
    expect(onReenabled).toHaveBeenCalledWith(["human-1", "human-2"]);
  });

  it("keeps the dialog open after the customer is switched back on underneath it", () => {
    const { rerenderWith } = renderNotice();
    fireEvent.click(reenableButton());
    rerenderWith({ ...human, whatsappOptedOut: false, whatsappOptedOutAt: null, whatsappOptedOutReason: null });
    expect(screen.queryByText("WhatsApp is off — they said STOP.")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Switch WhatsApp back on?" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
