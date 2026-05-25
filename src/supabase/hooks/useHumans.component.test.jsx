import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockHumans = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumans;
  },
}));

const { useHumans } = await import("./useHumans.js");

function makeSupabaseStub({ counts = {}, rows = {}, inRows = {} } = {}) {
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);

  return {
    from: vi.fn((table) => {
      const builder = {};
      let isCount = false;

      builder.select = vi.fn((_cols, opts) => {
        isCount = opts?.head === true;
        builder.abortSignal = vi.fn(() => {
          if (isCount) {
            return Promise.resolve({
              count: counts[table] ?? 0,
              error: null,
            });
          }
          return Promise.resolve({
            data: rows[table] ?? [],
            error: null,
          });
        });
        return builder;
      });

      builder.order = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      // `.in(...)` is terminal in the trusted-name resolution path; it
      // serves a separate dataset so a test can model a trusted human who
      // sits past the initial paginated window.
      builder.in = vi.fn(() =>
        Promise.resolve({ data: inRows[table] ?? [], error: null }),
      );
      builder.abortSignal = vi.fn(() => Promise.resolve({ data: [], error: null }));
      return builder;
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
}

describe("useHumans", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to empty maps and loading=false when supabase is null", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.humans).toEqual({});
    expect(result.current.humansById).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it("loads humans + trusted contacts on initial mount", async () => {
    const humanRows = [
      { id: "h1", name: "Sarah", surname: "Jones", phone: "07700900111" },
      { id: "h2", name: "Dave", surname: "Smith", phone: "07700900112" },
    ];
    const trustedRows = [
      { human_id: "h1", trusted_id: "h2", relationship: "partner" },
    ];

    setSupabase(
      makeSupabaseStub({
        counts: { humans: 2 },
        rows: { humans: humanRows, human_trusted_contacts: trustedRows },
      }),
    );

    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Object.keys(result.current.humansById)).toEqual(["h1", "h2"]);
    expect(result.current.humansById.h1.fullName).toBe("Sarah Jones");
    expect(result.current.totalCount).toBe(2);
    // The trusted-contact resolution feeds into the humans map (name-keyed);
    // check the linkage made it through buildTrustedMaps.
    const sarah = result.current.humans["Sarah Jones"];
    expect(sarah?.trustedContacts?.[0]?.fullName).toBe("Dave Smith");
  });

  it("resolves a trusted contact whose human sits past the paginated window", async () => {
    // Only Fiona is on the first page; her trusted human (Dale) is not.
    // buildTrustedMaps must fetch Dale's name by id, otherwise the link
    // is dropped and the Trusted Humans panel renders empty.
    const humanRows = [{ id: "h1", name: "Fiona", surname: "", phone: "07700900111" }];
    const trustedRows = [{ human_id: "h1", trusted_id: "h2", relationship: "dog walker" }];

    setSupabase(
      makeSupabaseStub({
        counts: { humans: 1 },
        rows: { humans: humanRows, human_trusted_contacts: trustedRows },
        inRows: { humans: [{ id: "h2", name: "Dale", surname: "" }] },
      }),
    );

    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() =>
      expect(result.current.humans["Fiona"]?.trustedContacts?.length ?? 0).toBeGreaterThan(0),
    );
    expect(result.current.humans["Fiona"].trustedContacts[0]).toMatchObject({
      id: "h2",
      fullName: "Dale",
      relationship: "dog walker",
    });
  });

  it("propagates the humans count-query error via state.error", async () => {
    setSupabase({
      from: vi.fn(() => {
        const builder = {};
        builder.select = vi.fn(() => {
          builder.abortSignal = vi.fn(() =>
            Promise.resolve({ count: null, error: { message: "rls denied" } }),
          );
          return builder;
        });
        builder.order = vi.fn(() => builder);
        builder.limit = vi.fn(() => builder);
        builder.abortSignal = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return builder;
      }),
      channel: vi.fn(() => {
        const channel = {};
        channel.on = vi.fn(() => channel);
        channel.subscribe = vi.fn(() => channel);
        return channel;
      }),
      removeChannel: vi.fn(),
    });
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rls denied");
  });
});
