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
