interface MeasurementPage<T> {
  data: T[] | null;
  count: number | null;
  error: unknown;
}

/** Fail closed on partial reads; never turn a server row limit into a metric. */
export async function readMeasurementPages<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<MeasurementPage<T>>,
  signal: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | undefined;
  // Bounded browser work. Larger volumes need a server aggregate, not a
  // silently truncated report or unbounded memory use.
  while (rows.length < 100_000) {
    if (signal.aborted) throw new Error("Measurement read aborted");
    const page = await fetchPage(rows.length, rows.length + 499);
    if (signal.aborted) throw new Error("Measurement read aborted");
    if (page.error) throw page.error;
    if (page.count === null || !Number.isInteger(page.count) || page.count < 0) {
      throw new Error("Measurement source count unavailable");
    }
    expected ??= page.count;
    if (page.count !== expected || expected > 100_000) {
      throw new Error("Measurement source changed or exceeds report limit");
    }
    for (const row of page.data ?? []) {
      if (!row.id || ids.has(row.id)) throw new Error("Measurement page identity mismatch");
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length === expected) return rows;
    if (rows.length > expected || !page.data?.length) {
      throw new Error("Incomplete measurement source");
    }
  }
  throw new Error("Measurement source exceeds report limit");
}
