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

export const STAFF_TITLE_SUFFIX = "Smarter Dog";
export const CUSTOMER_TITLE_SUFFIX = "Smarter Dog Bookings";

/**
 * @param mount       which entrance is mounted
 * @param pathname    the router's pathname, inside that entrance's basename
 * @param sectionTitle the staff section's display name, for the staff mount
 * @param signedIn    false while the entrance is showing its sign-in screen
 */
export function documentTitleFor(
  mount: TitleMount,
  pathname: string,
  sectionTitle: string | null | undefined,
  signedIn = true,
): string {
  if (mount === "reset-password") return `Reset password · ${CUSTOMER_TITLE_SUFFIX}`;

  if (mount === "customer") {
    if (!signedIn || pathname.startsWith("/login")) return `Sign in · ${CUSTOMER_TITLE_SUFFIX}`;
    if (pathname.startsWith("/new")) return `Book a groom · ${CUSTOMER_TITLE_SUFFIX}`;
    return `My bookings · ${CUSTOMER_TITLE_SUFFIX}`;
  }

  if (!signedIn) return `Staff sign in · ${STAFF_TITLE_SUFFIX}`;
  return sectionTitle ? `${sectionTitle} · ${STAFF_TITLE_SUFFIX}` : STAFF_TITLE_SUFFIX;
}
