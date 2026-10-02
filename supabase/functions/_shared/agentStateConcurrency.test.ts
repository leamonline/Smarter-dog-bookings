import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { rebaseAgentPatch } from "./agentStateConcurrency.ts";
Deno.test("disjoint corrections survive but overlapping newer answers never get overwritten", () => {
  const old = {preferredTime:"09:00",preferredDay:"Monday"};
  const patch = {corrections:[{field:"preferredTime" as const,value:null,evidence:"forget 09:00"}]};
  assertEquals(rebaseAgentPatch(old,{...old,preferredDay:"Tuesday"},patch)?.preferredDay,"Tuesday");
  assertEquals(rebaseAgentPatch(old,{...old,preferredTime:"11:00"},patch),null);
  assertEquals(rebaseAgentPatch({dogs:[{dogId:"a",dogAge:"2"},{dogId:"b",dogAge:"3"}]},{dogs:[{dogId:"a",dogAge:"2"},{dogId:"b",dogAge:"4"}]},{dogs:[{dogId:"a",dogAge:"5"}]} )?.dogs,[{dogId:"a",dogAge:"5"},{dogId:"b",dogAge:"4"}]);
});
