export function normalisePostcode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  if (!/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function parseLookupInput(
  body: unknown,
): { text: string } | { error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid_search" };
  }
  const input = body as Record<string, unknown>;
  if ("text" in input) {
    if (
      typeof input.text !== "string" ||
      /[\u0000-\u001f\u007f]/.test(input.text)
    ) {
      return { error: "invalid_search" };
    }
    const text = input.text.trim();
    return text.length >= 3 && text.length <= 200
      ? { text }
      : { error: "invalid_search" };
  }
  if ("postcode" in input) {
    const postcode =
      typeof input.postcode === "string"
        ? normalisePostcode(input.postcode)
        : null;
    return postcode ? { text: postcode } : { error: "invalid_postcode" };
  }
  return { error: "invalid_search" };
}
