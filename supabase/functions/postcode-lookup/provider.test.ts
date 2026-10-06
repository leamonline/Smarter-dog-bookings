import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { lookupAddresses, providerErrorCode } from "./provider.ts";
const postcode = "SK14 6JE";
const text = "1 Example Road, Example Town";
const premises = {
  country_code: "gb",
  result_type: "building",
  housenumber: "1",
  street: "Example Road",
  postcode,
  formatted: "1 Example Road, Example Town, SK14 6JE, United Kingdom",
};
function fromResponse(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}
function results(rows: unknown[]) {
  return fromResponse(Response.json({ results: rows }));
}

Deno.test(
  "Geoapify search is UK-restricted, bounded, encoded and held server-side",
  async () => {
    let calls = 0;
    const request: typeof fetch = (input, options) => {
      calls++;
      const url = new URL(String(input));
      assertEquals(url.origin, "https://api.geoapify.com");
      assertEquals(url.pathname, "/v1/geocode/autocomplete");
      assertEquals(url.searchParams.get("text"), text + " & #2");
      assertEquals(url.searchParams.get("filter"), "countrycode:gb");
      assertEquals(url.searchParams.get("format"), "json");
      assertEquals(url.searchParams.get("limit"), "10");
      assertEquals(url.searchParams.get("apiKey"), "test-only-key");
      assertEquals(options?.signal instanceof AbortSignal, true);
      return Promise.resolve(Response.json({ results: [premises] }));
    };
    const result = await lookupAddresses(
      text + " & #2",
      "test-only-key",
      request,
    );
    assertEquals(calls, 1);
    assertEquals(result.addresses, [
      { line: premises.formatted, postcode, udprn: null },
    ]);
  },
);
Deno.test(
  "postcodes, cities and streets cannot masquerade as a full customer address",
  async () => {
    const result = await lookupAddresses(
      text,
      "test-only",
      results([
        {
          ...premises,
          result_type: "postcode",
          housenumber: undefined,
          street: undefined,
        },
        {
          ...premises,
          result_type: "city",
          housenumber: undefined,
          street: undefined,
        },
        { ...premises, result_type: "street", housenumber: undefined },
        premises,
      ]),
    );
    assertEquals(result.addresses, [
      { line: premises.formatted, postcode, udprn: null },
    ]);
  },
);
Deno.test(
  "named UK premises are usable without inventing a Royal Mail identifier",
  async () => {
    const house = {
      ...premises,
      housenumber: undefined,
      name: "Willow House",
      postcode: "sk146je",
    };
    assertEquals(
      (await lookupAddresses(text, "test-only", results([house]))).addresses,
      [{ line: house.formatted, postcode, udprn: null }],
    );
  },
);
Deno.test(
  "outside-UK and incomplete premises are never selectable",
  async () => {
    const result = await lookupAddresses(
      text,
      "test-only",
      results([
        { ...premises, country_code: "us" },
        { ...premises, postcode: undefined },
        { ...premises, postcode: "SK14" },
        { ...premises, street: undefined },
      ]),
    );
    assertEquals(result.addresses, []);
  },
);
Deno.test("duplicate provider records produce one suggestion", async () => {
  assertEquals(
    (await lookupAddresses(text, "test-only", results([premises, premises])))
      .addresses.length,
    1,
  );
});
Deno.test(
  "a genuine empty result is no matches; legacy requests retain the postcode",
  async () => {
    assertEquals(await lookupAddresses("sk146je", "test-only", results([])), {
      postcode,
      addresses: [],
    });
  },
);
for (const status of [400, 401, 402, 403, 404, 429, 500, 503]) {
  Deno.test(
    `Geoapify HTTP ${status} is an upstream failure, never no matches`,
    async () => {
      await assertRejects(
        () =>
          lookupAddresses(
            text,
            "test-only",
            fromResponse(new Response("private diagnostic", { status })),
          ),
        Error,
        `geoapify_upstream_${status}`,
      );
    },
  );
}
for (const body of [
  "not JSON",
  "null",
  '{"error":"quota exceeded"}',
  '{"results":{}}',
  '{"results":[null]}',
]) {
  Deno.test(
    `malformed provider response ${body} is a bounded upstream failure`,
    async () => {
      await assertRejects(
        () =>
          lookupAddresses(text, "test-only", fromResponse(new Response(body))),
        Error,
        "geoapify_invalid_response",
      );
    },
  );
}
Deno.test(
  "diagnostics never propagate provider bodies, keys, queries or URLs",
  () => {
    assertEquals(
      providerErrorCode(
        new Error("fetch https://api.geoapify.com/?apiKey=secret&text=private"),
      ),
      "geoapify_request_failed",
    );
    assertEquals(
      providerErrorCode(new Error("geoapify_upstream_429")),
      "geoapify_upstream_429",
    );
    assertEquals(
      providerErrorCode(new Error("geoapify_invalid_response")),
      "geoapify_invalid_response",
    );
    assertEquals(
      providerErrorCode(new Error("geoapify_upstream_401 private details")),
      "geoapify_request_failed",
    );
  },
);
