import { describe, expect, it } from "vitest";
import { claimsExistingFromSignupResult, signupSavedToast } from "./signupOutcome";

describe("claimsExistingFromSignupResult", () => {
  it("is true only for the explicit claims_existing: true payload", () => {
    expect(claimsExistingFromSignupResult({ claims_existing: true })).toBe(true);
    expect(claimsExistingFromSignupResult({ claims_existing: false })).toBe(false);
    expect(claimsExistingFromSignupResult({ claims_existing: "true" })).toBe(false);
  });

  it("treats a void / malformed result as a plain signup", () => {
    expect(claimsExistingFromSignupResult(null)).toBe(false);
    expect(claimsExistingFromSignupResult(undefined)).toBe(false);
    expect(claimsExistingFromSignupResult("ok")).toBe(false);
    expect(claimsExistingFromSignupResult({})).toBe(false);
  });
});

describe("signupSavedToast", () => {
  it("sets the linking expectation for a claim and keeps the plain copy otherwise", () => {
    expect(signupSavedToast(true)).toMatch(/already know you/i);
    expect(signupSavedToast(true)).toMatch(/link your account/i);
    expect(signupSavedToast(false)).toBe("Thanks — your details are in!");
  });
});
