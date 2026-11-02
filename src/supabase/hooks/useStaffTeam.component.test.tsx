import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  refreshSession: vi.fn(),
  rows: [] as unknown[],
  listError: null as unknown,
  client: null as unknown,
}));

vi.mock("../client", () => ({
  get supabase() {
    return h.client;
  },
}));
vi.mock("../../lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { isTeamBackendAvailable, useStaffTeam } from "./useStaffTeam";

function makeClient() {
  return {
    from: vi.fn(() => ({
      select: () => ({ order: () => Promise.resolve({ data: h.rows, error: h.listError }) }),
    })),
    functions: { invoke: h.invoke },
    auth: { refreshSession: h.refreshSession },
  };
}

const row = (id: string, name: string, role = "staff") => ({
  id,
  user_id: `u-${id}`,
  role,
  display_name: name,
  created_at: "2026-01-01",
});

const httpError = (status: number, body: unknown) => ({
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: () => Promise.resolve(body) },
});

beforeEach(() => {
  h.invoke.mockReset();
  h.refreshSession.mockReset();
  h.rows = [row("p1", "Leam", "owner")];
  h.listError = null;
  h.client = makeClient();
});

describe("useStaffTeam", () => {
  it("loads the team when enabled, and does nothing when not", async () => {
    const off = renderHook(() => useStaffTeam(false));
    expect(off.result.current.members).toBeNull();
    expect((h.client as ReturnType<typeof makeClient>).from).not.toHaveBeenCalled();

    const on = renderHook(() => useStaffTeam(true));
    await waitFor(() => expect(on.result.current.members).toHaveLength(1));
    expect(on.result.current.members?.[0]).toMatchObject({ displayName: "Leam", role: "owner" });
  });

  it("reports a load failure in plain words", async () => {
    h.listError = { message: "rls" };
    const { result } = renderHook(() => useStaffTeam(true));
    await waitFor(() => expect(result.current.loadError).toMatch(/couldn't load the team/i));
    expect(result.current.members).toBeNull();
  });

  it("invites through the staff-invite function with the snake_case body, then shows what the server wrote", async () => {
    // The fake server does the write itself, from the body it receives. The
    // test never pre-loads the expected member, so it fails if the hook sends
    // the wrong fields or does not refresh the list afterwards.
    h.invoke.mockImplementation((_name: string, opts: { body: Record<string, string> }) => {
      h.rows = [...h.rows, row("p2", opts.body.display_name, opts.body.role)];
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    const { result } = renderHook(() => useStaffTeam(true));
    await waitFor(() => expect(result.current.members).toHaveLength(1));

    let outcome;
    await act(async () => {
      outcome = await result.current.invite({ email: "alex@example.com", displayName: "Alex", role: "owner" });
    });

    expect(outcome).toEqual({ ok: true });
    expect(h.invoke).toHaveBeenCalledWith("staff-invite", {
      body: { email: "alex@example.com", display_name: "Alex", role: "owner" },
    });
    // The list now holds the row the "server" wrote, carrying the name and role we sent.
    expect(result.current.members).toHaveLength(2);
    expect(result.current.members?.[1]).toMatchObject({ displayName: "Alex", role: "owner" });
  });

  it("returns the function's own reason when it refuses, and does not refresh the list", async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: httpError(409, { ok: false, reason: "A login already exists for that email." }),
    });
    const { result } = renderHook(() => useStaffTeam(true));
    await waitFor(() => expect(result.current.members).toHaveLength(1));
    const fromCalls = (h.client as ReturnType<typeof makeClient>).from.mock.calls.length;

    let outcome;
    await act(async () => {
      outcome = await result.current.invite({ email: "a@b.co", displayName: "A", role: "staff" });
    });

    expect(outcome).toEqual({ ok: false, message: "A login already exists for that email." });
    expect((h.client as ReturnType<typeof makeClient>).from.mock.calls.length).toBe(fromCalls);
  });

  it("says the login expired on a 401 that a session refresh cannot fix", async () => {
    h.invoke.mockResolvedValue({ data: null, error: httpError(401, { ok: false, reason: "invalid token" }) });
    h.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "no" } });
    const { result } = renderHook(() => useStaffTeam(true));
    await waitFor(() => expect(result.current.members).toHaveLength(1));

    let outcome;
    await act(async () => {
      outcome = await result.current.invite({ email: "a@b.co", displayName: "A", role: "staff" });
    });
    expect(outcome).toEqual({ ok: false, message: "Your login has expired. Please sign in again." });
  });

  it("refuses cleanly in sample-data mode", async () => {
    h.client = null;
    expect(isTeamBackendAvailable()).toBe(false);
    const { result } = renderHook(() => useStaffTeam(true));
    let outcome;
    await act(async () => {
      outcome = await result.current.invite({ email: "a@b.co", displayName: "A", role: "staff" });
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
