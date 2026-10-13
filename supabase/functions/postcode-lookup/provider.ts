import { normalisePostcode } from "./input.ts";

const GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode/autocomplete";

export function providerErrorCode(error: unknown): string {
  return error instanceof Error &&
    /^geoapify_(upstream_\d{3}|invalid_response)$/.test(error.message)
    ? error.message
    : "geoapify_request_failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function lookupAddresses(
  text: string,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<{
  postcode: string | null;
  addresses: Array<{ line: string; postcode: string; udprn: null }>;
}> {
  const url = new URL(GEOAPIFY_URL);
  url.search = new URLSearchParams({
    text,
    apiKey,
    filter: "countrycode:gb",
    format: "json",
    limit: "10",
  }).toString();
  const res = await request(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  // Geoapify reports genuine no matches in a successful empty results array.
  // Every HTTP failure remains a failure, including account/quota problems.
  if (!res.ok) {
    throw new Error(`geoapify_upstream_${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("geoapify_invalid_response");
  }

  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new Error("geoapify_invalid_response");
  }
  const addresses: Array<{ line: string; postcode: string; udprn: null }> = [];
  const seen = new Set<string>();
  for (const address of body.results) {
    if (
      !isRecord(address) ||
      typeof address.formatted !== "string" ||
      !address.formatted.trim()
    ) {
      throw new Error("geoapify_invalid_response");
    }
    const postcode =
      typeof address.postcode === "string"
        ? normalisePostcode(address.postcode)
        : null;
    const hasPremises =
      (typeof address.housenumber === "string" && address.housenumber.trim()) ||
      (typeof address.name === "string" && address.name.trim());
    // Geoapify also suggests cities/postcodes/streets. Those are useful map
    // locations but cannot complete a customer's postal address.
    if (
      address.country_code !== "gb" ||
      !postcode ||
      !hasPremises ||
      typeof address.street !== "string" ||
      !address.street.trim() ||
      ["country", "state", "city", "postcode", "street", "locality"].includes(
        String(address.result_type),
      )
    )
      continue;
    const line = address.formatted.trim();
    const key = `${line}\n${postcode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push({ line, postcode, udprn: null });
    if (addresses.length === 10) break;
  }

  return { postcode: normalisePostcode(text), addresses };
}
