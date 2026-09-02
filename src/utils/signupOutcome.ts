// What submit_customer_signup told us about the signup it just saved.
//
// The RPC returns {"claims_existing": bool}: true when the typed name matched
// a customer already on the books, so the shell was submitted as a CLAIM on
// that record (staff link it) rather than as a brand-new customer (staff
// approve it). Older deployments returned void; treat anything that isn't the
// explicit true as a plain signup so the copy never over-promises.
export function claimsExistingFromSignupResult(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  return (data as { claims_existing?: unknown }).claims_existing === true;
}

/** Toast shown the moment the signup saves, before the hold screen takes over. */
export function signupSavedToast(claimsExisting: boolean): string {
  return claimsExisting
    ? "Thanks — looks like we already know you! The team will link your account."
    : "Thanks — your details are in!";
}
