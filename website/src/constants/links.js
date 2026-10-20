// Where the marketing site sends a visitor who wants to book.
//
// Since the 11 September 2026 domain cutover one deployment serves the
// marketing site at "/" and the customer portal at "/book", so this is now a
// same-origin destination. It pointed at smarterdog.vercel.app until then,
// which still worked but bounced customers onto a Vercel hostname.
//
// Deliberately "/book/login" and not "/book": this site has its own "/book"
// route that redirects here (App.jsx), so aiming this at "/book" would be a
// redirect loop anywhere that route is the one serving the path, such as a
// host that carries only the marketing build with no edge rewrite for "/book".
// "/book/login" does not match that route, and is the screen
// "/customer/login" already redirected to.
export const BOOKING_URL = 'https://smarterdog.co.uk/book/login';

// Where the small dog-silhouette circle next to the social icons in the
// footer sends staff. Same-origin since the cutover, and "/stafflogin" is
// not a route this site owns, so it cannot loop like "/book" would.
export const STAFF_LOGIN_URL = 'https://smarterdog.co.uk/stafflogin';
