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
 * React Router matches case-insensitively and tolerates repeated trailing
 * slashes, so `/book/NEW//` renders the wizard. Titles are resolved from the
 * same normalised form, so they describe the view that actually rendered.
 */
export function normaliseTitlePath(pathname: string): string {
  const lower = (pathname || "/").toLowerCase().replace(/\/{2,}/g, "/");
  const trimmed = lower.length > 1 ? lower.replace(/\/+$/, "") : lower;
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
  if (mount === "reset-password") return `Reset password · ${CUSTOMER_TITLE_SUFFIX}`;

  if (auth === "loading") {
    return mount === "staff" ? STAFF_TITLE_SUFFIX : CUSTOMER_TITLE_SUFFIX;
  }

  if (mount === "customer") {
    if (auth === "setup") return `Your account · ${CUSTOMER_TITLE_SUFFIX}`;
    // Exact segments, matching the router: `/login` is the guard's login route
    // and `new` the wizard; anything else (`/news`) falls to the dashboard.
    if (auth !== "in" || isRoute(pathname, "/login")) return `Sign in · ${CUSTOMER_TITLE_SUFFIX}`;
    if (isRoute(pathname, "/new")) return `Book a groom · ${CUSTOMER_TITLE_SUFFIX}`;
    return `My bookings · ${CUSTOMER_TITLE_SUFFIX}`;
  }

  if (auth === "out") return `Staff sign in · ${STAFF_TITLE_SUFFIX}`;
  if (auth === "denied") return `Staff access needed · ${STAFF_TITLE_SUFFIX}`;
  return sectionTitle ? `${sectionTitle} · ${STAFF_TITLE_SUFFIX}` : STAFF_TITLE_SUFFIX;
}

function isRoute(pathname: string, route: string): boolean {
  return normaliseTitlePath(pathname) === route;
}
