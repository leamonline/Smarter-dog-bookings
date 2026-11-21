// Where the marketing site sends a visitor who wants to book.
//
// Since the 11 September 2026 domain cutover one deployment serves the
// marketing site at "/" and the customer portal at "/book", so this is now a
// same-origin destination. It pointed at smarterdog.vercel.app until then,
// which still worked but bounced customers onto a Vercel hostname.
//
// Open the wizard directly. Its authentication guard keeps this destination
// through sign-in and account setup. This also avoids the marketing /book redirect.
export const BOOKING_URL = 'https://smarterdog.co.uk/book/new';

// Where the small dog-silhouette circle next to the social icons in the
// footer sends staff. Same-origin since the cutover, and "/stafflogin" is
// not a route this site owns, so it cannot loop like "/book" would.
export const STAFF_LOGIN_URL = 'https://smarterdog.co.uk/stafflogin';
