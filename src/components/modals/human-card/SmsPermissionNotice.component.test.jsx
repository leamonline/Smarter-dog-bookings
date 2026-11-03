import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const sms = vi.hoisted(() => ({
  connected: true,
  confirm: vi.fn(),
  withdraw: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../../../supabase/hooks/useSmsPermission", () => ({ useSmsPermission: () => sms }));

const { SmsPermissionNotice } = await import("./SmsPermissionNotice.jsx");

const stopped = { id: "h1", phone: "07123456789", whatsappOptedOut: true, preferredChannel: null };
const confirmed = { ...stopped, preferredChannel: "sms" };

function renderNotice(human, onChanged = vi.fn()) {
  render(
    <ToastProvider>
      <SmsPermissionNotice human={human} onChanged={onChanged} />
    </ToastProvider>,
  );
  return onChanged;
}

describe("SmsPermissionNotice", () => {
  beforeEach(() => {
    sms.confirm.mockReset();
    sms.withdraw.mockReset();
    sms.history.mockReset();
    sms.history.mockResolvedValue({ ok: true, rows: [] });
  });

  it("renders nothing for a customer who never stopped", () => {
    renderNotice({ id: "h1", phone: "07123456789", whatsappOptedOut: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("flags a STOP: automatic texts are paused until staff clarify", () => {
    renderNotice(stopped);
    expect(screen.getByRole("status")).toHaveTextContent(/Texts are paused/i);
    expect(screen.getByRole("status")).toHaveTextContent(/said STOP on WhatsApp/i);
    expect(screen.getByRole("button", { name: /Confirm texts are fine/ })).toBeInTheDocument();
  });

  it("explains an SMS opt-out and offers no way round it", () => {
    renderNotice({ ...stopped, smsOptedOut: true });
    expect(screen.getByRole("status")).toHaveTextContent(/opted out/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("cannot be confirmed without a number", () => {
    renderNotice({ ...stopped, phone: "" });
    expect(screen.queryByRole("button", { name: /Confirm texts are fine/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/no mobile number/i);
  });

  it("will not save without a reason, and says what is missing", async () => {
    renderNotice(stopped);
    fireEvent.click(screen.getByRole("button", { name: /Confirm texts are fine/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm texts are fine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/how they told you texts are fine/i);
    expect(sms.confirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/How did they tell you/), { target: { value: "too short" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm texts are fine" }));
    expect(sms.confirm).not.toHaveBeenCalled();
  });

  it("saves the trimmed reason, then patches the customer and closes", async () => {
    sms.confirm.mockResolvedValue({ ok: true, auditId: "audit-1" });
    const onChanged = renderNotice(stopped);
    fireEvent.click(screen.getByRole("button", { name: /Confirm texts are fine/ }));
    fireEvent.change(screen.getByLabelText(/How did they tell you/), { target: { value: "  Rang her: texts about bookings are fine  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm texts are fine" }));
    await waitFor(() => expect(sms.confirm).toHaveBeenCalledWith("h1", "Rang her: texts about bookings are fine"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("h1", "sms"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open and the customer unchanged when the database refuses", async () => {
    sms.confirm.mockResolvedValue({ ok: false, error: { code: "P0001", message: "x", details: "sms_opted_out" } });
    const onChanged = renderNotice(stopped);
    fireEvent.click(screen.getByRole("button", { name: /Confirm texts are fine/ }));
    fireEvent.change(screen.getByLabelText(/How did they tell you/), { target: { value: "Rang her: texts about bookings are fine" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm texts are fine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/opted out of texts/i);
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows who confirmed, when and why, and lets staff pause texts again with a reason", async () => {
    sms.history.mockResolvedValue({
      ok: true,
      rows: [{ id: "a", action: "confirmed", reason: "Rang her: texts about bookings are fine", confirmedBy: "u1", confirmedByName: "Sam Staff", createdAt: "2026-11-03T10:00:00Z" }],
    });
    sms.withdraw.mockResolvedValue({ ok: true, auditId: "audit-2" });
    const onChanged = renderNotice(confirmed);
    // The confirmer is named in the status line and again in the history entry.
    expect((await screen.findAllByText(/Sam Staff/)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("status")).toHaveTextContent(/Rang her: texts about bookings are fine/);
    fireEvent.click(screen.getByRole("button", { name: /Pause texts again/ }));
    fireEvent.change(screen.getByLabelText(/Why are texts being paused again/), { target: { value: "She asked us to stop all messages" } });
    fireEvent.click(screen.getByRole("button", { name: "Pause texts again" }));
    await waitFor(() => expect(sms.withdraw).toHaveBeenCalledWith("h1", "She asked us to stop all messages"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("h1", null));
  });
});
