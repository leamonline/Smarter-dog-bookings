// Static invariants for the customer dog photo (20261115120000) and
// customer-added trusted contact (20261115120100) migrations. Behaviour is
// covered by pgTAP (supabase/tests/263 and 264); these pin the shape that
// review relies on.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const PHOTOS_FILE = "20261115120000_customer_dog_photos.sql";
const CONTACTS_FILE = "20261115120100_customer_trusted_contacts.sql";
const PREVIOUS_MERGE_FILE = "20261016120000_whatsapp_opt_out_followups.sql";

const read = (name: string) => readFileSync(join(migrationsDir, name), "utf8");
// SQL without its `--` comments, so prose ("drop off", "unlike
// human_trusted_contacts") cannot satisfy or trip a statement check.
const code = (sql: string) => sql.replace(/--.*$/gm, "");

function extractFunction(sql: string, header: string): string {
  const start = sql.indexOf(header);
  expect(start, `${header} is defined`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

function lastDefiner(name: string): string | undefined {
  const pattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(public\\.)?${name}\\s*\\(`, "i");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => pattern.test(read(file)))
    .at(-1);
}

const MERGE_HEADER = "create or replace function public.merge_humans(p_winner uuid, p_loser uuid)";
const MERGE_ADDITION = `  update public.customer_trusted_contacts
    set owner_human_id=p_winner where owner_human_id=p_loser;
`;

describe("customer dog photos migration (20261115120000)", () => {
  const sql = read(PHOTOS_FILE);

  it("keeps the bucket private and constrained", () => {
    expect(sql).toMatch(/values \('dog-photos', 'dog-photos', false, 2097152, array\['image\/jpeg', 'image\/webp'\]\)/);
    expect(sql).toMatch(/on conflict \(id\) do update\s+set public = false/);
  });

  it("gives customers no way to overwrite an object", () => {
    expect(sql).not.toMatch(/create policy \w+ on storage\.objects\s+for update/i);
  });

  it("revokes every new function from the API roles and grants only authenticated", () => {
    for (const sig of ["public.customer_owns_dog_photo_path(text)", "public.set_customer_dog_photo(uuid, text)"]) {
      for (const role of ["public", "anon", "authenticated"]) {
        expect(sql, `${sig} revoked from ${role}`).toContain(`revoke all on function ${sig} from ${role};`);
      }
      expect(sql).toContain(`grant execute on function ${sig} to authenticated;`);
    }
  });

  it("only accepts a photo path inside the dog's own folder", () => {
    const fn = extractFunction(sql, "create or replace function public.set_customer_dog_photo(");
    expect(fn).toContain("'^' || p_dog_id::text");
    expect(fn).toContain("o.bucket_id = 'dog-photos' and o.name = v_path");
    expect(fn).toContain("d.archived_at is null");
  });
});

describe("customer trusted contacts migration (20261115120100)", () => {
  const sql = read(CONTACTS_FILE);

  it("never touches humans rows or the staff trusted-contact links", () => {
    // The July lock (pgTAP 120): no customer path may look up, create or link
    // a humans row. Strip merge_humans, which legitimately does all three.
    const withoutMerge = code(sql.replace(extractFunction(sql, MERGE_HEADER), ""));
    expect(withoutMerge).not.toMatch(/insert\s+into\s+public\.humans/i);
    expect(withoutMerge).not.toMatch(/human_trusted_contacts/i);
    expect(withoutMerge).not.toMatch(/from public\.humans h\s+where h\.phone/i);
    expect(withoutMerge).not.toMatch(/add_customer_trusted_human/i);
  });

  it("gives customers no direct table policy", () => {
    const policies = sql.match(/create policy (\w+) on public\.customer_trusted_contacts/g) ?? [];
    expect(policies).toEqual([
      "create policy staff_select_customer_trusted_contacts on public.customer_trusted_contacts",
      "create policy staff_delete_customer_trusted_contacts on public.customer_trusted_contacts",
    ]);
    expect(sql).toContain("using ((select public.is_staff()));");
  });

  it("revokes every customer command from the API roles and grants only authenticated", () => {
    for (const sig of [
      "public.list_customer_trusted_contacts()",
      "public.save_customer_trusted_contact(uuid, text, text, text, text)",
      "public.remove_customer_trusted_contact(uuid)",
    ]) {
      for (const role of ["public", "anon", "authenticated"]) {
        expect(sql, `${sig} revoked from ${role}`).toContain(`revoke all on function ${sig} from ${role};`);
      }
      expect(sql).toContain(`grant execute on function ${sig} to authenticated;`);
    }
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke all on function public.normalise_trusted_contact_phone(text) from ${role};`);
    }
  });

  it("re-issues merge_humans byte-for-byte except moving customer-added contacts", () => {
    const before = extractFunction(read(PREVIOUS_MERGE_FILE), MERGE_HEADER);
    const after = extractFunction(sql, MERGE_HEADER);
    const at = after.indexOf(MERGE_ADDITION);
    expect(at, "the addition is present").toBeGreaterThanOrEqual(0);
    expect(after.indexOf(MERGE_ADDITION, at + 1), "the addition appears once").toBe(-1);
    expect(after.slice(0, at) + after.slice(at + MERGE_ADDITION.length)).toBe(before);
    // Placed before the loser is deleted, or the cascade would remove them.
    expect(at).toBeLessThan(after.indexOf("delete from public.humans where id = p_loser;"));
  });

  it("is the last migration defining merge_humans", () => {
    expect(lastDefiner("merge_humans")).toBe(CONTACTS_FILE);
  });

  it("drops nothing", () => {
    expect(code(sql)).not.toMatch(/\bdrop\s+(table|function|trigger|policy|index|column|view|schema|type)\b/i);
  });
});
