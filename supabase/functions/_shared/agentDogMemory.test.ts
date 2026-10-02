import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseDogMemory, mergeDogMemory } from "./agentDogMemory.ts";
Deno.test("dog memory requires canonical ownership, rejects duplicate targeting and preserves separate dogs", () => {
  const ids = new Set(["pip", "moss"]);
  assertEquals(parseDogMemory([{dogId:"stranger",dogAge:"2"}], ids), []);
  const patch = parseDogMemory([{dogId:"pip",dogAge:"12 weeks"},{dogId:"pip",dogAge:"4"},{dogId:"moss",coatCondition:"matted"}], ids);
  assertEquals(patch, [{dogId:"pip",dogAge:"12 weeks"},{dogId:"moss",coatCondition:"matted"}]);
  assertEquals(mergeDogMemory([{dogId:"pip",alerts:["nervous"]},{dogId:"moss",dogAge:"4"}],patch), [{dogId:"pip",alerts:["nervous"],dogAge:"12 weeks"},{dogId:"moss",dogAge:"4",coatCondition:"matted"}]);
  assertEquals(parseDogMemory([{dogId:"pip",dogAge:null,alerts:[],service:"invented"}],ids), []);
});
