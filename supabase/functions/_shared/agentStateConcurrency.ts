import { type AgentDogMemory, mergeDogMemory, parseDogMemory } from "./agentDogMemory.ts";
import { mergeAgentState, type AgentState } from "./agentRisk.ts";
// `null` is an explicit clear (the corrections contract) and `undefined` is
// "never set"; they must not compare equal here, or a stale clear of a field
// the other turn has just filled in rebases straight over the newer value.
const equal = (a: unknown, b: unknown) =>
  (a === undefined) === (b === undefined) && JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const UNREBASED = new Set<string>(["corrections", "dogs"]);
/**
 * Retry only the patch's own changes, and only where nobody else changed the
 * same field. The patch is reduced to its delta against the snapshot the model
 * saw, so a field it merely echoes can never overwrite a newer answer; a
 * field it changed conflicts when the latest state changed it differently.
 */
export function rebaseAgentPatch(original: AgentState, latest: AgentState, patch: Partial<AgentState>): AgentState | null {
  if (!Array.isArray(latest.dogs) && original.dogs?.length === 1) {
    const dogId = original.dogs[0].dogId;
    latest = {...latest, dogs: parseDogMemory([{dogId, dogAge: latest.dogAge, coatCondition: latest.coatCondition, service: latest.service, alerts: latest.alerts}], new Set([dogId]))};
  }
  const proposed = mergeAgentState(original, patch);
  const added = proposed.corrections?.slice(original.corrections?.length ?? 0) ?? [];
  // A field a correction names is touched even when its value already matched
  // the snapshot: "forget my time" and a concurrent "make it 11:00" disagree.
  const touched = new Set<string>(added.map(c => c.field));
  const next = {...latest} as Record<string, unknown>;
  for (const key of new Set([...Object.keys(original), ...Object.keys(proposed)])) {
    if (UNREBASED.has(key)) continue;
    const was = (original as Record<string, unknown>)[key];
    const want = (proposed as Record<string, unknown>)[key];
    const now = (latest as Record<string, unknown>)[key];
    if (equal(want, was) && !touched.has(key)) continue;
    if (!equal(now, was) && !equal(now, want)) return null;
    if (want === undefined) delete next[key]; else next[key] = want;
  }
  const dogDelta: AgentDogMemory[] = [];
  for (const dog of proposed.dogs ?? []) {
    const old = original.dogs?.find(d => d.dogId === dog.dogId);
    const current = latest.dogs?.find(d => d.dogId === dog.dogId);
    const changed: AgentDogMemory = {dogId: dog.dogId};
    for (const key of Object.keys(dog) as (keyof AgentDogMemory)[]) {
      if (key === "dogId" || equal(dog[key], old?.[key])) continue;
      if (!equal(current?.[key], old?.[key]) && !equal(current?.[key], dog[key])) return null;
      (changed as unknown as Record<string, unknown>)[key] = dog[key];
    }
    if (Object.keys(changed).length > 1) dogDelta.push(changed);
  }
  if (dogDelta.length) next.dogs = mergeDogMemory(latest.dogs, dogDelta);
  if (added.length) next.corrections = [...(latest.corrections ?? []), ...added].slice(-10);
  return next as AgentState;
}
