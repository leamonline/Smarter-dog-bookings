import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerSql = readFileSync(
  "supabase/migrations/20260726144004_customer_visit_commands.sql",
  "utf8",
);
const policySql = readFileSync(
  "supabase/migrations/20260726144005_staff_visit_policy_commands.sql",
  "utf8",
);
const staffWriteSql = readFileSync(
  "supabase/migrations/20260726144007_staff_visit_write_commands.sql",
  "utf8",
);
const staffCancellationSql = [
  staffWriteSql,
  readFileSync(
    "supabase/migrations/20260726144008_staff_prepayment_and_terms_notice.sql",
    "utf8",
  ),
  readFileSync(
    "supabase/migrations/20260726144009_staff_terms_notice_and_transfer_legs.sql",
    "utf8",
  ),
].join("\n");
const finalCancellationSql = readFileSync(
  "supabase/migrations/20260726144009_staff_terms_notice_and_transfer_legs.sql",
  "utf8",
);

function functionBody(sql: string, signatureStart: string): string {
  const start = sql.indexOf(signatureStart);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("as $$", start);
  const bodyEnd = sql.indexOf("$$;", bodyStart);
  expect(bodyStart).toBeGreaterThan(start);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return sql.slice(bodyStart, bodyEnd);
}

describe("booking visit optimistic row revision migrations", () => {
  it("binds customer reviews to the mutable row revision", () => {
    expect(customerSql).toContain(
      "or rev.source_revision <> v.row_revision",
    );
    expect(customerSql).toContain(
      "p_visit_id, 'cancel', v.row_revision",
    );
  });

  it("checks staff visit mutations against the mutable row revision", () => {
    expect(policySql).toContain(
      "or v.row_revision <> p_expected_visit_revision",
    );
    expect(policySql).not.toContain(
      "or v.revision <> p_expected_visit_revision",
    );
    expect(staffCancellationSql).toContain(
      "v.row_revision <> p_expected_revision",
    );
    expect(staffCancellationSql).not.toContain(
      "v.revision <> p_expected_revision",
    );
  });

  it("advances the row revision without rewriting the lineage ordinal", () => {
    expect(policySql).toContain(
      "row_revision = row_revision + 1",
    );
    expect(staffWriteSql).toContain(
      "set row_revision = row_revision + 1",
    );
    expect(staffWriteSql).not.toContain(
      "set revision = revision + 1,\n         updated_at = now()",
    );
  });

  it("rejects missing expected revisions in every final staff mutation", () => {
    const finalBodies = [
      functionBody(
        finalCancellationSql,
        "create or replace function smarter_dog_private.cancel_staff_visit_dispatch(",
      ),
      functionBody(
        staffWriteSql,
        "create or replace function smarter_dog_private.reschedule_staff_visit_dispatch(",
      ),
      functionBody(
        staffWriteSql,
        "create or replace function smarter_dog_private.update_staff_visit_dispatch(",
      ),
    ];

    for (const body of finalBodies) {
      expect(body).toContain(
        "if p_expected_revision is null or v.row_revision <> p_expected_revision then",
      );
      expect(body.indexOf("replay_receipt")).toBeLessThan(
        body.indexOf("p_expected_revision is null"),
      );
    }
  });

  it("rejects an unknown paid-deposit outcome before final staff cancellation mutates", () => {
    const body = functionBody(
      finalCancellationSql,
      "create or replace function smarter_dog_private.cancel_staff_visit_dispatch(",
    );
    const validation = body.indexOf(
      "coalesce(p_paid_deposit_outcome, 'refund') not in ('refund','credit')",
    );
    const firstMutation = body.indexOf(
      "update public.booking_service_prepayment_reconciliations",
    );

    expect(validation).toBeGreaterThanOrEqual(0);
    expect(firstMutation).toBeGreaterThan(validation);
    expect(body).toContain("'invalid_paid_deposit_outcome'");
  });
});
