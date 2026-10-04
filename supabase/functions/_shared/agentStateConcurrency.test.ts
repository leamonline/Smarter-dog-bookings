import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { rebaseAgentPatch } from "./agentStateConcurrency.ts";
Deno.test("disjoint corrections survive but overlapping newer answers never get overwritten", () => {
  const old = {preferredTime:"09:00",preferredDay:"Monday"};
  const patch = {corrections:[{field:"preferredTime" as const,value:null,evidence:"forget 09:00"}]};
  const rebased = rebaseAgentPatch(old,{...old,preferredDay:"Tuesday"},patch);
  assertEquals(rebased?.preferredDay,"Tuesday");
  assertEquals(rebased?.preferredTime,null);
  assertEquals(rebased?.corrections?.length,1);
  assertEquals(rebaseAgentPatch(old,{...old,preferredTime:"11:00"},patch),null);
  assertEquals(rebaseAgentPatch({dogs:[{dogId:"a",dogAge:"2"},{dogId:"b",dogAge:"3"}]},{dogs:[{dogId:"a",dogAge:"2"},{dogId:"b",dogAge:"4"}]},{dogs:[{dogId:"a",dogAge:"5"}]} )?.dogs,[{dogId:"a",dogAge:"5"},{dogId:"b",dogAge:"4"}]);
});
Deno.test("an explicit clear of a never-set field conflicts with a concurrent answer to it", () => {
  const patch = {corrections:[{field:"preferredTime" as const,value:null,evidence:"no preference"}]};
  assertEquals(rebaseAgentPatch({},{preferredTime:"11:00"},patch),null);
  assertEquals(rebaseAgentPatch({preferredTime:null},{preferredTime:"11:00"},patch),null);
  // Nobody else touched it: the clear lands.
  assertEquals(rebaseAgentPatch({},{preferredDay:"Monday"},patch)?.preferredTime,null);
});
Deno.test("a field the patch merely echoes never overwrites the newer answer", () => {
  const rebased = rebaseAgentPatch({preferredTime:"09:00"},{preferredTime:"11:00"},{preferredTime:"09:00",preferredDay:"Monday"});
  assertEquals(rebased?.preferredTime,"11:00");
  assertEquals(rebased?.preferredDay,"Monday");
  const dogs = rebaseAgentPatch({dogs:[{dogId:"a",dogAge:"2"}]},{dogs:[{dogId:"a",dogAge:"5"}]},{dogs:[{dogId:"a",dogAge:"2",coatCondition:"matted"}]})?.dogs;
  assertEquals(dogs,[{dogId:"a",dogAge:"5",coatCondition:"matted"}]);
});
Deno.test("a concurrent explicit clear conflicts with a stale answer to the same field", () => {
  assertEquals(rebaseAgentPatch({preferredTime:"09:00"},{preferredTime:null},{preferredTime:"11:00"}),null);
});
