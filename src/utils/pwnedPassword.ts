// Checks a password against HaveIBeenPwned's Pwned Passwords API using
// k-anonymity: we SHA-1 the password locally, send ONLY the first 5 hex chars
// of the hash, and match the returned suffixes ourselves. The password — and
// its full hash — never leave the browser. This is the same check Supabase's
// "leaked password protection" runs server-side, but that's a Pro-plan
// feature; doing it client-side here makes it available on any plan, on the
// primary customer auth path (phone + password).
//
// Fails OPEN: any error (no Web Crypto, network blip, API down) returns false
// ("not known-breached") so a transient problem never blocks a customer from
// setting a password. It's a best-effort safety net, not a hard gate.

async function sha1HexUpper(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * True if the password appears in a known breach (per HIBP Pwned Passwords).
 * Never throws; returns false on any failure.
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  if (!password) return false;

  let hash: string;
  try {
    hash = await sha1HexUpper(password);
  } catch {
    return false; // no Web Crypto available — don't block
  }

  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Add-Padding pads the response with bogus entries so even the count of
      // matches for a prefix can't be inferred from the response size.
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      if (line.slice(0, sep).trim().toUpperCase() === suffix) {
        // A padded/zero-count entry (count 0) is a decoy — ignore it.
        const count = parseInt(line.slice(sep + 1).trim(), 10);
        if (count > 0) return true;
      }
    }
    return false;
  } catch {
    return false; // network / API error — fail open
  }
}
