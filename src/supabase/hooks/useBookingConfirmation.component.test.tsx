import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmationSnapshot, ConfirmationContact } from "../repositories/bookingConfirmationRepo";

const mocks = vi.hoisted(() => ({ read: vi.fn(), contact: vi.fn(), resend: vi.fn() }));
vi.mock("../client", () => ({ supabase: {} }));
vi.mock("../repositories/bookingConfirmationRepo", () => ({
  fetchConfirmationSnapshot: mocks.read, fetchConfirmationContact: mocks.contact,
}));
vi.mock("./useStaffMessaging", () => ({ useStaffMessaging: () => ({ resendBookingNotification: mocks.resend }) }));
import { useBookingConfirmation, useConfirmationContact } from "./useBookingConfirmation";

const failed: ConfirmationSnapshot = { logs: [{
  bookingId: "actual-saved-id", groupId: null, humanId: "owner", trigger: "confirmed", channel: "sms",
  status: "failed", error: "Provider refused", createdAt: "2026-11-11T10:00:00Z", providerId: null,
}], deliveries: [] };
const contact: ConfirmationContact = { preferredService: "sms", phone: "+447700900123", whatsapp: true, email: null, whatsappOptedOut: false, smsOptedOut: false, emailOptedOut: false };

beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue(structuredClone(failed)); });
describe("booking receipt status and recovery", () => {
  it("resends only a confirmation for the saved ID and reads its new outcome", async () => {
    const stored = structuredClone(failed);
    mocks.read.mockImplementation(async () => structuredClone(stored));
    mocks.resend.mockImplementation(async (id, trigger) => {
      expect(id).toBe("actual-saved-id"); expect(trigger).toBe("confirmed");
      stored.logs[0] = { ...stored.logs[0], status: "sent", providerId: "sms-1" };
      return { data: { ok: true }, error: null };
    });
    const { result } = renderHook(() => useBookingConfirmation(["actual-saved-id"], ["owner"], true));
    await waitFor(() => expect(result.current.state).toBe("failed"));
    await act(async () => { await result.current.retry(); });
    expect(mocks.resend).toHaveBeenCalledTimes(1);
    expect(stored.logs[0].status).toBe("sent");
    expect(result.current.state).toBe("accepted");
    expect(result.current.retryBookingIds).toEqual([]);
  });
  it("reconciles a stale failure before retry and blocks an uncertain outcome", async () => {
    const { result } = renderHook(() => useBookingConfirmation(["actual-saved-id"], ["owner"], true));
    await waitFor(() => expect(result.current.state).toBe("failed"));
    const uncertain = structuredClone(failed); uncertain.logs[0].error = "outcome unknown: timeout";
    mocks.read.mockResolvedValue(uncertain);
    await act(async () => { await result.current.retry(); });
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(result.current.state).toBe("unknown");
  });
  it("does not send after a failed status read", async () => {
    const { result } = renderHook(() => useBookingConfirmation(["actual-saved-id"], ["owner"], true));
    await waitFor(() => expect(result.current.state).toBe("failed"));
    mocks.read.mockRejectedValue(new Error("private database detail"));
    await act(async () => { await result.current.retry(); });
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(result.current.error).not.toContain("private");
  });
  it("does not fetch or send for a suppressed confirmation", async () => {
    const { result } = renderHook(() => useBookingConfirmation(["actual-saved-id"], ["owner"], false));
    await act(async () => { await result.current.retry(); });
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.resend).not.toHaveBeenCalled();
  });
});

describe("preferred service read", () => {
  it("loads the saved preference instead of inferring it from WhatsApp availability", async () => {
    mocks.contact.mockResolvedValue(contact);
    const { result } = renderHook(() => useConfirmationContact("owner", null));
    await waitFor(() => expect(result.current.contact?.preferredService).toBe("sms"));
    expect(result.current.loading).toBe(false);
  });
  it("distinguishes no preference from a failed contact read", async () => {
    mocks.contact.mockResolvedValue({ ...contact, preferredService: null });
    const { result } = renderHook(() => useConfirmationContact("owner", null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact?.preferredService).toBeNull(); expect(result.current.error).toBe(false);
    mocks.contact.mockRejectedValue(new Error("unavailable"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.contact).toBeNull();
  });
});
