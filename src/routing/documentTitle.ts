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

/** Where the visitor stands with the entrance's sign-in. */
export type TitleAuth = "in" | "out" | "denied";

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

  if (mount === "customer") {
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
  return pathname === route || pathname === `${route}/`;
}
