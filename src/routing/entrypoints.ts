/**
 * Where a URL enters the booking app.
 *
 * The booking app shares an origin with the marketing site, so it no longer
 * owns `/`. Customers enter at /book, staff at /stafflogin, and each app runs
 * in its own React Router with a matching `basename`. That matters: basename is
 * stripped from `useLocation().pathname` and added back by `navigate()`, so
 * every absolute path already written inside the two apps — "/today",
 * "/dogs/:id", the pathname regexes in useProfileRouting — keeps working
 * untouched. Rewriting them all by hand would have been the alternative.
 */

export const CUSTOMER_BASENAME = "/book";
export const STAFF_BASENAME = "/staff";
/** What staff type or bookmark; it lands them on the sign-in screen. */
export const STAFF_ENTRY_PATH = "/stafflogin";

export type Mount = "customer" | "staff" | "reset-password";

export interface MountTarget {
  mount: Mount;
  /** Passed straight to <BrowserRouter basename>. */
  basename: string;
}

/** Segment-aware, so /bookings is never mistaken for the /book portal. */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * The URL to send a request to before mounting anything, or null to mount here.
 *
 * Vercel serves the same redirects, so in production this mostly catches links
 * that were already open in someone's browser. It is also what keeps the old
 * smarterdog.vercel.app URLs working: there "/" and "/today" are staff paths.
 */
export function resolveLegacyRedirect(pathname: string): string | null {
  const path = stripTrailingSlash(pathname);

  if (path === STAFF_ENTRY_PATH) return `${STAFF_BASENAME}/`;

  if (isUnder(path, "/customer")) {
    const rest = path.slice("/customer".length);
    // The wizard was "book", which under the /book basename would have read
    // as /book/book.
    if (rest === "/book") return `${CUSTOMER_BASENAME}/new`;
    return `${CUSTOMER_BASENAME}${rest}`;
  }

  if (
    path === "/reset-password" ||
    isUnder(path, CUSTOMER_BASENAME) ||
    isUnder(path, STAFF_BASENAME)
  ) {
    return null;
  }

  // Anything else is a staff path from before the move — "/", "/today",
  // "/inbox" — either bookmarked or on smarterdog.vercel.app.
  return path === "/" ? `${STAFF_BASENAME}/` : `${STAFF_BASENAME}${path}`;
}

/** Which app to mount, and under which basename. Null means redirect first. */
export function resolveMount(pathname: string): MountTarget | null {
  const path = stripTrailingSlash(pathname);

  if (path === "/reset-password") {
    return { mount: "reset-password", basename: "/" };
  }
  if (isUnder(path, CUSTOMER_BASENAME)) {
    return { mount: "customer", basename: CUSTOMER_BASENAME };
  }
  if (isUnder(path, STAFF_BASENAME)) {
    return { mount: "staff", basename: STAFF_BASENAME };
  }
  return null;
}
