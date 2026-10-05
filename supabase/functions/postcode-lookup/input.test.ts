import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseLookupInput } from "./input.ts";
Deno.test("new search accepts trimmed address text", () => {
  assertEquals(parseLookupInput({ text: "  1 Example Road, Hyde  " }), {
    text: "1 Example Road, Hyde",
  });
});
Deno.test(
  "cached clients can still submit a canonical or compact postcode",
  () => {
    assertEquals(parseLookupInput({ postcode: " sk146je " }), {
      text: "SK14 6JE",
    });
    assertEquals(parseLookupInput({ postcode: "SK14" }), {
      error: "invalid_postcode",
    });
  },
);
for (const value of [
  null,
  [],
  "street",
  42,
  {},
  { text: 42 },
  { text: " " },
  { text: "ab" },
  { text: "a".repeat(201) },
  { text: "address\u0000" },
]) {
  Deno.test(
    `invalid/unbounded search is rejected: ${JSON.stringify(value)}`,
    () => {
      assertEquals(parseLookupInput(value), { error: "invalid_search" });
    },
  );
}
Deno.test("invalid new text cannot fall back to the legacy postcode", () => {
  assertEquals(parseLookupInput({ text: null, postcode: "SK14 6JE" }), {
    error: "invalid_search",
  });
});
