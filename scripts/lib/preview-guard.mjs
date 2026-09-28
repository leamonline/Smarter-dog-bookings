// Which data a Vercel build is allowed to bake in (#875).
//
// VITE_ variables are fixed at build time, so the build is the last point at
// which a wrong one can be stopped. Two mistakes, both silent at runtime:
//
//   - a PREVIEW build without VITE_FORCE_OFFLINE=1 connects to production:
//     anyone with the preview link can read real customers and, signed in as
//     staff, trigger real messages;
//   - a PRODUCTION build WITH it serves sample data to the salon and to real
//     customers, as though bookings had vanished.
//
// Outside Vercel (local builds, CI, Playwright) VERCEL_ENV is unset and this
// says nothing — those callers choose offline mode themselves.

/** Returns an error message for a forbidden combination, or null when the build may proceed. */
export function previewDataGuard(env) {
  const vercelEnv = env.VERCEL_ENV;
  const offline = env.VITE_FORCE_OFFLINE === "1";
  if (vercelEnv === "preview" && !offline) {
    return (
      "Refusing to build a Vercel PREVIEW that would connect to production data. " +
      "Set VITE_FORCE_OFFLINE=1 on the Preview environment (Project Settings → " +
      "Environment Variables, Preview only). See #875."
    );
  }
  if (vercelEnv === "production" && offline) {
    return (
      "Refusing to build PRODUCTION with VITE_FORCE_OFFLINE=1 — the live app would " +
      "serve sample data. Remove the variable from the Production environment. See #875."
    );
  }
  return null;
}
