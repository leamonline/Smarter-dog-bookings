import { describe, expect, it, vi } from "vitest";
import { readMeasurementPages } from "./readMeasurementPages";

const signal = () => new AbortController().signal;
const page = (ids: string[], count: number | null = ids.length) => ({ data: ids.map(id => ({ id })), count, error: null });

describe("complete measurement reads", () => {
  it("continues through server-capped pages and returns every row once", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(["a"], 2)).mockResolvedValueOnce(page(["b"], 2));
    expect(await readMeasurementPages(fetch, signal())).toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetch).toHaveBeenNthCalledWith(2, 1, 500);
  });
  it("accepts a verified empty source", async () => {
    expect(await readMeasurementPages(async () => page([]), signal())).toEqual([]);
  });
  it.each([
    [page(["a"], 2), page([], 2)],
    [page(["a"], 2), page(["a"], 2)],
    [page(["a"], 2), page(["b"], 3)],
  ])("rejects incomplete, overlapping or changing pages", async (first, second) => {
    const fetch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await expect(readMeasurementPages(fetch, signal())).rejects.toThrow();
  });
  it.each([null, -1, 0.5, 100_001])("rejects unavailable or unsafe count %s", async count => {
    await expect(readMeasurementPages(async () => page([], count), signal())).rejects.toThrow();
  });
  it("rejects excess rows and missing identities", async () => {
    await expect(readMeasurementPages(async () => page(["a"], 0), signal())).rejects.toThrow();
    await expect(readMeasurementPages(async () => page([""]), signal())).rejects.toThrow();
  });
  it("propagates query errors and rejected requests", async () => {
    await expect(readMeasurementPages(async () => ({ ...page([]), error: new Error("failed") }), signal())).rejects.toThrow("failed");
    await expect(readMeasurementPages(async () => { throw new Error("network"); }, signal())).rejects.toThrow("network");
  });
  it("does not query or return stale data after abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    await expect(readMeasurementPages(fetch, controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const next = new AbortController();
    await expect(readMeasurementPages(async () => { next.abort(); return page([]); }, next.signal)).rejects.toThrow();
  });
});
