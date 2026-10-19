import { DOG_PROFILE_PATH, HUMAN_PROFILE_PATH } from "../hooks/useProfileRouting";

// Page titles per route (#1004).
//
// Every route used to share index.html's one <title>, so a row of tabs or the
// browser history read "SmarterDog — Salon Bookings" eight times over, and a
// screen reader announced nothing on navigation. The title is decided here, in
// one place, from where the visitor is — never set view by view.
//
// Pure: the staff section name comes in from navConfig's `sectionTitleFor`, so
// the tab and the on-screen section heading cannot drift apart.

export type TitleMount = "staff" | "customer" | "reset-password";

/**
 * Where the visitor stands with the entrance's gate:
 *  - "in"      the entrance's own screens are showing
 *  - "out"     the sign-in screen
 *  - "denied"  signed in, but no staff profile (the access-needed screen)
 *  - "loading" the gate has not resolved yet (only the spinner shows)
 *  - "setup"   a customer stopped at an account step (password, approval, profile)
 */
export type TitleAuth = "in" | "out" | "denied" | "loading" | "setup";

/**
 * React Router matches case-insensitively and tolerates trailing slashes, so
 * `/book/NEW//` renders the wizard. It does NOT collapse an internal double
 * slash: `/book//new` misses the `new` route and renders the dashboard. So this
 * lowercases and strips trailing slashes only, and the title describes the view
 * that actually rendered.
 */
export function normaliseTitlePath(pathname: string): string {
  // Decode each segment as the router does (`/n%65w` is `/new`), keeping an
  // encoded slash encoded so it can never invent a new segment.
  const decoded = (pathname || "/")
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment.replace(/%2f/gi, "%252F"));
      } catch {
        return segment;
      }
    })
    .join("/");
  const lower = decoded.toLowerCase();
  const trimmed = lower.replace(/\/+$/, "");
  return trimmed || "/";
}

export const STAFF_TITLE_SUFFIX = "Smarter Dog";
export const CUSTOMER_TITLE_SUFFIX = "Smarter Dog Bookings";

/**
 * @param mount       which entrance is mounted
 * @param pathname    the router's pathname, inside that entrance's basename
 * @param sectionTitle the staff section's display name, for the staff mount
 * @param auth        "out" on the sign-in screen; "denied" when signed in but
 *                    without a staff profile (the access-needed screen)
 */
export function documentTitleFor(
  mount: TitleMount,
  pathname: string,
  sectionTitle: string | null | undefined,
  auth: TitleAuth = "in",
): string {
  // Normalised exactly once, here: decoding twice would turn `%256eew` into
  // `new`, which the router (decoding once) never matches.
  const path = normaliseTitlePath(pathname);

  if (mount === "reset-password") return `Reset password · ${CUSTOMER_TITLE_SUFFIX}`;

  if (auth === "loading") {
    return mount === "staff" ? STAFF_TITLE_SUFFIX : CUSTOMER_TITLE_SUFFIX;
  }

  if (mount === "customer") {
    if (auth === "setup") return `Your account · ${CUSTOMER_TITLE_SUFFIX}`;
    // "Sign in" comes only from the route guard's own decision (auth "out"),
    // never from the path: once signed in, every path but `new` renders the
    // dashboard, `/login` included. `new` is matched as React Router does.
    if (auth === "out") return `Sign in · ${CUSTOMER_TITLE_SUFFIX}`;
    if (path === "/new") return `Book a groom · ${CUSTOMER_TITLE_SUFFIX}`;
    return `My bookings · ${CUSTOMER_TITLE_SUFFIX}`;
  }

  if (auth === "out") return `Staff sign in · ${STAFF_TITLE_SUFFIX}`;
  if (auth === "denied") return `Staff access needed · ${STAFF_TITLE_SUFFIX}`;
  if (!sectionTitle) return STAFF_TITLE_SUFFIX;
  const page = staffPageLabel(pathname, path);
  return page
    ? `${page} · ${sectionTitle} · ${STAFF_TITLE_SUFFIX}`
    : `${sectionTitle} · ${STAFF_TITLE_SUFFIX}`;
}


/**
 * Sub-pages that share a section but show different content, so each tab and
 * history entry is distinguishable (profiles, the two report pages).
 */
function staffPageLabel(raw: string, path: string): string | null {
  // Profiles open only when useProfileRouting's own parser matches the RAW
  // path, so the label uses that parser on the same input, not a looser one.
  if (DOG_PROFILE_PATH.test(raw)) return "Dog profile";
  if (HUMAN_PROFILE_PATH.test(raw)) return "Human profile";
  if (path === "/reports/cash-up") return "Cash-up";
  if (path === "/reports/insights") return "Insights";
  return null;
}
