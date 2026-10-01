import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../client", () => ({ supabase: {} }));
vi.mock("../repositories/inboxWorkingSchedule", () => ({ fetchInboxWorkingSchedule: mocks.fetch }));
import { useInboxWaitingTimes } from "./useInboxWaitingTimes";
const request = { id: "a", last_inbound_at: "2026-06-15T07:30:00Z", last_customer_text: "Can I book?", has_pending_draft: true };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("keeps unsent drafts waiting and refreshes after focus", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T09:30:00Z"));
  mocks.fetch.mockResolvedValue({ from: "2026-06-15", to: "2026-06-15", days: {}, holidays: [] });
  const { result, rerender, unmount } = renderHook(({ rows }) => useInboxWaitingTimes(rows), { initialProps: { rows: [request] } });
  await waitFor(() => expect(result.current.a).toBe("Waiting 2h 0m working time"));
  mocks.fetch.mockRejectedValue(new Error("offline"));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current.a).toBe("Waiting time unavailable"));
  rerender({ rows: [{ ...request, closed_at: "2026-06-15T10:00:00Z" }] });
  expect(result.current.a).toBeNull();
  unmount();
});
it("does not publish a response after unmount", async () => {
  let resolve;
  mocks.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { unmount } = renderHook(() => useInboxWaitingTimes([request]));
  unmount();
  await act(async () => resolve({ from: "2026-06-15", to: "2026-12-31", days: {}, holidays: [] }));
});
