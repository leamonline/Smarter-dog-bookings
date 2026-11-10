// The one rule every customer-journey script and test shares: the Supabase
// target must be this machine. These tools create users, truncate bookings and
// reseed, so pointing them at a hosted project would destroy real records.
// A URL is accepted only when its host is a loopback address.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function assertLoopbackUrl(value, label) {
  let url;
  try {
    url = new URL(String(value ?? ""));
  } catch {
    throw new Error(`${label} is not a URL. Customer journey tests need the local Supabase stack.`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `${label} points at ${url.hostname}, which is not this machine. ` +
        "Customer journey tests reset and reseed their database and only ever run against the local Supabase stack.",
    );
  }
  return url;
}

export const LOCAL_API_URL = "http://127.0.0.1:54321";
export const LOCAL_DB = {
  host: "127.0.0.1",
  port: "54322",
  user: "postgres",
  password: "postgres",
  database: "postgres",
};
