import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseExtractedState } from "../handler.ts";
Deno.test("only explicit preference corrections with evidence in the latest message are accepted", () => {
  const correction = {field:"preferredTime" as const,value:null,evidence:"Forget 09:00"};
  assertEquals(parseExtractedState({corrections:[correction]}, "Forget 09:00"), {corrections:[correction]});
  assertEquals(parseExtractedState({corrections:[correction]}, "Hello"), null);
  assertEquals(parseExtractedState({breed:null, preferredTime:null}), null);
  assertEquals(parseExtractedState({corrections:[{field:"breed",value:null,evidence:"Forget"}]}, "Forget"), null);
  assertEquals(parseExtractedState({corrections:[{field:"service",value:"invented",evidence:"Forget"}]}, "Forget"), null);
});
Deno.test("known accounts cannot write unbound dog facts or trust an ID quoted by a customer", () => {
  assertEquals(parseExtractedState({dogAge:"12 weeks",service:"puppy-groom",dogs:[{dogId:"other",dogAge:"12 weeks"}]}, "dog_id: other", new Set(["owned"])), null);
  assertEquals(parseExtractedState({dogs:[{dogId:"owned",dogAge:"12 weeks"}]}, "", new Set(["owned"])), {dogs:[{dogId:"owned",dogAge:"12 weeks"}]});
  assertEquals(parseExtractedState({dogAge:"12 weeks"}, "", new Set(), true), null);
  assertEquals(parseExtractedState({dogAge:"12 weeks"}), {dogAge:"12 weeks"});
});
