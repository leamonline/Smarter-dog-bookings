import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { lookupAddresses } from "./provider.ts";

const postcode = "SK14 6JE";
function fromResponse(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

Deno.test("provider addresses retain the public lookup response contract", async () => {
  const response = Response.json({ result: { postcode, addresses: [
    { address: "1 Example Road, Example Town", postcode, udprn: "10000001" },
  ] } });
  assertEquals(await lookupAddresses(postcode, "test-only", fromResponse(response)), {
    postcode,
    addresses: [{ line: "1 Example Road, Example Town", postcode, udprn: "10000001" }],
  });
});

Deno.test("a genuine provider not-found response returns no matches", async () => {
  assertEquals(await lookupAddresses(postcode, "test-only", fromResponse(new Response(null, { status: 404 }))), {
    postcode, addresses: [],
  });
});

Deno.test("a valid empty provider result returns no matches", async () => {
  assertEquals(await lookupAddresses(postcode, "test-only", fromResponse(Response.json({ result: { postcode, addresses: [] } }))), {
    postcode, addresses: [],
  });
});

Deno.test("numeric Royal Mail identifiers remain usable address identifiers", async () => {
  const response = Response.json({ result: { addresses: [
    { address: "1 Example Road", udprn: 10000001 },
  ] } });
  assertEquals(await lookupAddresses(postcode, "test-only", fromResponse(response)), {
    postcode, addresses: [{ line: "1 Example Road", postcode, udprn: "10000001" }],
  });
});

for (const status of [400, 401, 402, 403, 429, 500, 503]) {
  Deno.test(`provider HTTP ${status} is an upstream failure, never no matches`, async () => {
    await assertRejects(
      () => lookupAddresses(postcode, "test-only", fromResponse(new Response("private provider diagnostic", { status }))),
      Error, `apitier_upstream_${status}`,
    );
  });
}

for (const body of ["not JSON", "null", '{"error":"quota exceeded"}', '{"result":{}}', '{"result":{"addresses":"wrong type"}}']) {
  Deno.test(`malformed provider response ${body} is a bounded upstream failure`, async () => {
    await assertRejects(
      () => lookupAddresses(postcode, "test-only", fromResponse(new Response(body))),
      Error, "apitier_invalid_response",
    );
  });
}

Deno.test("an address record with no usable line is not silently discarded", async () => {
  await assertRejects(
    () => lookupAddresses(postcode, "test-only", fromResponse(Response.json({ result: { addresses: [{ street: "Unexpected provider field" }] } }))),
    Error, "apitier_invalid_response",
  );
});
