/** Conversation memory only; canonical customer/dog rows remain authoritative. */
export interface AgentDogMemory {
  dogId: string;
  dogAge?: string;
  coatCondition?: string;
  service?: "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom";
  alerts?: string[];
}
export function parseDogMemory(value: unknown, ownedIds: ReadonlySet<string>): AgentDogMemory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: AgentDogMemory[] = [];
  for (const raw of value.slice(0, 20)) {
    if (!raw || typeof raw !== "object" || typeof raw.dogId !== "string" || !ownedIds.has(raw.dogId) || seen.has(raw.dogId)) continue;
    seen.add(raw.dogId);
    const dog: AgentDogMemory = {dogId: raw.dogId};
    for (const field of ["dogAge", "coatCondition"] as const) if (typeof raw[field] === "string" && raw[field].trim()) dog[field] = raw[field].trim().slice(0, 200);
    if (["full-groom", "bath-and-brush", "bath-and-deshed", "puppy-groom"].includes(raw.service)) dog.service = raw.service;
    // Null/empty lists are not removal requests. Explicit dog-health clears need their own contract.
    if (Array.isArray(raw.alerts) && raw.alerts.every((a: unknown) => typeof a === "string")) {
      const alerts = raw.alerts.map((a: string) => a.trim().slice(0, 100)).filter(Boolean).slice(0, 10);
      if (alerts.length) dog.alerts = alerts;
    }
    if (Object.keys(dog).length > 1) result.push(dog);
  }
  return result;
}
export function mergeDogMemory(previous: AgentDogMemory[] = [], patch: AgentDogMemory[]): AgentDogMemory[] {
  const ids = new Set([...previous, ...patch].map(d => d.dogId));
  const accepted = parseDogMemory(patch, ids);
  const rows = new Map(parseDogMemory(previous, ids).map(d => [d.dogId, d]));
  for (const dog of accepted) rows.set(dog.dogId, {...rows.get(dog.dogId), ...dog});
  return [...rows.values()].slice(0, 20);
}
