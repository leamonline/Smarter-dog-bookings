// A phone-number save that lost to humans_phone_unique.
//
// Postgres reports every unique collision as SQLSTATE 23505, so a caller
// can't tell "this name already exists" from "this number already belongs
// to someone" without reading the constraint name out of the message.
// updateHuman does that once, here, and throws a typed error so the Human
// card can offer the right next step (link a pending portal signup, or
// name the customer who already has the number) instead of a raw
// "duplicate key value violates unique constraint".

export class HumanPhoneTakenError extends Error {
  readonly phone: string;

  constructor(phone: string) {
    super("That phone number is already on another customer's record");
    this.name = "HumanPhoneTakenError";
    this.phone = phone;
  }
}

export function isHumanPhoneTakenError(err: unknown): err is HumanPhoneTakenError {
  return err instanceof HumanPhoneTakenError;
}

/** True when a PostgREST error is the humans.phone unique index rejecting a write. */
export function isPhoneUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err || err.code !== "23505") return false;
  return /humans_phone_unique/i.test(err.message || "");
}
