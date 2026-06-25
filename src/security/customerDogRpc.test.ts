import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260625090000_create_customer_dog_rpc.sql",
  "utf8",
);

describe("create_customer_dog RPC hardening", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SET search_path = public/i);
  });
  it("enforces ownership of p_human_id against the caller's human", () => {
    expect(sql).toMatch(/p_human_id\s+IS\s+NULL\s+OR\s+p_human_id\s*<>\s*v_my_id/i);
  });
  it("revokes anon and grants only authenticated", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_customer_dog.*FROM anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_customer_dog.*TO authenticated/i);
    expect(sql).not.toMatch(/TO anon/i);
  });
});
