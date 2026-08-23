// funnelSession — one funnel session_id per booking attempt, persisted in
// sessionStorage. These tests simulate the remount / refresh / completion
// lifecycles that produced the three production telemetry bugs: split
// session ids, out-of-order steps, and post-booking stub sessions.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FUNNEL_SESSION_KEY,
  claimFunnelStep,
  clearFunnelSession,
  getOrCreateFunnelSession,
} from "./funnelSession";

class FakeSessionStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const globalWithStorage = globalThis as { sessionStorage?: unknown };

describe("funnelSession with working sessionStorage", () => {
  beforeEach(() => {
    globalWithStorage.sessionStorage = new FakeSessionStorage();
    clearFunnelSession();
  });
  afterEach(() => {
    clearFunnelSession();
    delete globalWithStorage.sessionStorage;
  });

  it("keeps one session id across remounts (getOrCreate is stable)", () => {
    const first = getOrCreateFunnelSession();
    const second = getOrCreateFunnelSession(); // a wizard remount
    expect(second.id).toBe(first.id);
  });

  it("persists the record under the single agreed key", () => {
    const record = getOrCreateFunnelSession();
    const raw = (globalWithStorage.sessionStorage as FakeSessionStorage).getItem(
      FUNNEL_SESSION_KEY,
    );
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      id: record.id,
      stepIndex: 0,
      startedLogged: false,
    });
  });

  it("allows 'started' exactly once per attempt, even across remounts", () => {
    const first = claimFunnelStep("started");
    expect(first).not.toBeNull();
    expect(first?.stepIndex).toBe(0);
    // Same mount retry and a remount both find startedLogged already set.
    expect(claimFunnelStep("started")).toBeNull();
    expect(claimFunnelStep("started")).toBeNull();
  });

  it("hands out strictly increasing step indexes on one session id", () => {
    const claims = [
      claimFunnelStep("started"),
      claimFunnelStep("select_dogs"),
      claimFunnelStep("select_service"),
      claimFunnelStep("select_slot"),
      claimFunnelStep("booked"),
    ];
    for (const claim of claims) expect(claim).not.toBeNull();
    const ids = new Set(claims.map((c) => c?.sessionId));
    expect(ids.size).toBe(1);
    const indexes = claims.map((c) => c?.stepIndex);
    expect(indexes).toEqual([0, 1, 2, 3, 4]);
  });

  it("clearing ends the attempt: next claim is a fresh session with started available again", () => {
    const before = claimFunnelStep("started");
    claimFunnelStep("booked");
    clearFunnelSession();
    const after = claimFunnelStep("started");
    expect(after).not.toBeNull();
    expect(after?.sessionId).not.toBe(before?.sessionId);
    expect(after?.stepIndex).toBe(0);
  });

  it("mints a fresh session when the stored record is corrupt", () => {
    (globalWithStorage.sessionStorage as FakeSessionStorage).setItem(
      FUNNEL_SESSION_KEY,
      "{not json",
    );
    const record = getOrCreateFunnelSession();
    expect(record.stepIndex).toBe(0);
    expect(record.startedLogged).toBe(false);
    // and the mint self-heals the storage
    const raw = (globalWithStorage.sessionStorage as FakeSessionStorage).getItem(
      FUNNEL_SESSION_KEY,
    );
    expect(JSON.parse(raw as string).id).toBe(record.id);
  });

  it("mints a fresh session when the stored record has the wrong shape", () => {
    (globalWithStorage.sessionStorage as FakeSessionStorage).setItem(
      FUNNEL_SESSION_KEY,
      JSON.stringify({ id: 42, stepIndex: "three" }),
    );
    const record = getOrCreateFunnelSession();
    expect(typeof record.id).toBe("string");
    expect(record.stepIndex).toBe(0);
  });
});

describe("funnelSession without sessionStorage (privacy mode / non-DOM)", () => {
  beforeEach(() => {
    delete globalWithStorage.sessionStorage;
    clearFunnelSession();
  });
  afterEach(() => {
    clearFunnelSession();
  });

  it("degrades to an in-memory session that still dedupes started and orders steps", () => {
    const started = claimFunnelStep("started");
    expect(started?.stepIndex).toBe(0);
    expect(claimFunnelStep("started")).toBeNull();
    const next = claimFunnelStep("select_dogs");
    expect(next?.sessionId).toBe(started?.sessionId);
    expect(next?.stepIndex).toBe(1);
  });
});
