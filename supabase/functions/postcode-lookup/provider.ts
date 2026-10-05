const APITIER_BASE = "https://postcode.apitier.com/v1/postcodes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function lookupAddresses(
  postcode: string,
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<{ postcode: string; addresses: Array<{ line: string; postcode: string; udprn: string | null }> }> {
  const url = `${APITIER_BASE}/${encodeURIComponent(postcode)}?x-api-key=${encodeURIComponent(apiKey)}`;
  const res = await request(url, { headers: { accept: "application/json" } });

  // A genuine missing postcode is different from a failed provider account,
  // exhausted credit or outage. Those failures must never look like no matches.
  if (res.status === 404) return { postcode, addresses: [] };
  if (!res.ok) {
    throw new Error(`apitier_upstream_${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("apitier_invalid_response");
  }

  const result = isRecord(body) ? body.result : null;
  if (!isRecord(result) || !Array.isArray(result.addresses) ||
    (result.postcode != null && typeof result.postcode !== "string")) {
    throw new Error("apitier_invalid_response");
  }
  const resolvedPostcode = typeof result.postcode === "string" ? result.postcode.trim() : postcode;
  const addresses = result.addresses.map((address: unknown) => {
    if (!isRecord(address) || typeof address.address !== "string" || !address.address.trim() ||
      (address.postcode != null && typeof address.postcode !== "string") ||
      (address.udprn != null && typeof address.udprn !== "string" &&
        !(typeof address.udprn === "number" && Number.isSafeInteger(address.udprn) && address.udprn >= 0))) {
      throw new Error("apitier_invalid_response");
    }
    return {
      line: address.address.trim(),
      postcode: typeof address.postcode === "string" ? address.postcode.trim() : resolvedPostcode,
      udprn: address.udprn == null ? null : String(address.udprn),
    };
  });

  return { postcode: resolvedPostcode, addresses };
}
