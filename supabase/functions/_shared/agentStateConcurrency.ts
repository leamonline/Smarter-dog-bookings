import { parseDogMemory } from "./agentDogMemory.ts";
import { mergeAgentState, type AgentState } from "./agentRisk.ts";
const equal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Retry only disjoint changes. Never overwrite a newer answer to the same field. */
export function rebaseAgentPatch(original: AgentState, latest: AgentState, patch: Partial<AgentState>): AgentState | null {
  if (!Array.isArray(latest.dogs) && original.dogs?.length === 1) {
    const dogId = original.dogs[0].dogId;
    latest = {...latest, dogs: parseDogMemory([{dogId, dogAge: latest.dogAge, coatCondition: latest.coatCondition, service: latest.service, alerts: latest.alerts}], new Set([dogId]))};
  }
  const proposed = mergeAgentState(original, patch);
  for (const key of Object.keys(proposed) as (keyof AgentState)[]) {
    if (key === "corrections" || key === "dogs") continue;
    if (!equal(proposed[key], original[key]) && !equal(latest[key], original[key]) && !equal(latest[key], proposed[key])) return null;
  }
  for (const dog of proposed.dogs ?? []) {
    const old = original.dogs?.find(d => d.dogId === dog.dogId);
    const current = latest.dogs?.find(d => d.dogId === dog.dogId);
    for (const key of Object.keys(dog) as (keyof typeof dog)[]) {
      if (key === "dogId") continue;
      if (!equal(dog[key], old?.[key]) && !equal(current?.[key], old?.[key]) && !equal(current?.[key], dog[key])) return null;
    }
  }
  return mergeAgentState(latest, patch);
}
