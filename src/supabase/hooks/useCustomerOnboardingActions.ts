// Action hook for the customer onboarding gates (Debt #12): binds the customer
// Supabase client to the four writes the gates need — profile completion,
// self-signup submission, password set/change and the postcode lookup Edge
// Function — so ProfileGate, JoinThePackOnboarding, SetPasswordGate and
// AddressPicker never import the client themselves. Results are returned in
// the same `{ data, error }` shape the underlying calls produce, so each gate
// keeps its own friendly-copy handling unchanged.
import { customerSupabase } from "../customerClient";
import { completeCustomerProfile, submitCustomerSignup } from "../rpc";

type Client = NonNullable<typeof customerSupabase>;

function requireClient(): Client {
  if (!customerSupabase) throw new Error("Not connected");
  return customerSupabase;
}

export type CompleteProfileInput = Parameters<typeof completeCustomerProfile>[1];
export type SubmitSignupInput = Parameters<typeof submitCustomerSignup>[1];

/** The complete_customer_profile RPC (name, surname, address, postcode, policies version). */
export async function completeProfile(input: CompleteProfileInput) {
  return completeCustomerProfile(requireClient(), input);
}

/** The submit_customer_signup RPC (owner details plus one or more dogs). */
export async function submitSignup(input: SubmitSignupInput) {
  return submitCustomerSignup(requireClient(), input);
}

/** Set or change the signed-in customer's password via Supabase Auth. */
export async function setPassword(password: string) {
  return requireClient().auth.updateUser({ password });
}

/**
 * The postcode-lookup Edge Function. Returns the raw invoke result: on a
 * non-2xx response `error.context` is the Response, which AddressPicker
 * reads to distinguish an invalid postcode from a rate limit.
 */
export async function lookupPostcode(postcode: string) {
  return requireClient().functions.invoke("postcode-lookup", { body: { postcode } });
}

const actions = {
  /** False in sample-data mode or before credentials exist; the actions throw. */
  get connected(): boolean {
    return Boolean(customerSupabase);
  },
  completeProfile,
  submitSignup,
  setPassword,
  lookupPostcode,
};

export type CustomerOnboardingActions = typeof actions;

/** The client is a module constant, so this is a stable singleton. */
export function useCustomerOnboardingActions(): CustomerOnboardingActions {
  return actions;
}
