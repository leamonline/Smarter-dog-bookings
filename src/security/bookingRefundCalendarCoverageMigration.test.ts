import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerCommands = readFileSync(
  "supabase/migrations/20260726144004_customer_visit_commands.sql",
  "utf8",
);
const staffCommands = readFileSync(
  "supabase/migrations/20260726144005_staff_visit_policy_commands.sql",
  "utf8",
);
const staffCancellationDefinitions = [
  "20260726144007_staff_visit_write_commands.sql",
  "20260726144008_staff_prepayment_and_terms_notice.sql",
  "20260726144009_staff_terms_notice_and_transfer_legs.sql",
].map((file) =>
  readFileSync(`supabase/migrations/${file}`, "utf8"),
);

describe("refund-creating commands use verified calendar coverage", () => {
  it("fails loudly before customer cancellation or credit-refund promises", () => {
    expect(
      customerCommands.match(/from public\.refund_due_at_verified\(/g),
    ).toHaveLength(2);
    expect(customerCommands).not.toMatch(
      /v_due := public\.refund_due_at\(p_at\)/,
    );
    expect(customerCommands).not.toMatch(
      /v_due := public\.refund_due_at\(statement_timestamp\(\)\)/,
    );
  });

  it("fails loudly before resolving a deposit liability to refund", () => {
    expect(
      staffCommands.match(/from public\.refund_due_at_verified\(/g),
    ).toHaveLength(1);
    expect(staffCommands).not.toMatch(
      /v_due := public\.refund_due_at\(statement_timestamp\(\)\)/,
    );
  });

  it("persists the verified calendar source in every staff-cancellation definition", () => {
    for (const sql of staffCancellationDefinitions) {
      expect(sql).toMatch(
        /select rv\.due_at,\s*rv\.coverage_id,\s*rv\.calendar_source\s+into v_due,\s*v_coverage,\s*v_calendar_source\s+from public\.refund_due_at_verified\(p_at\) rv/s,
      );
      expect(sql).toContain(
        "'deposit_working_days', v_calendar_source, v_coverage",
      );
      expect(sql).not.toContain(
        "'deposit_working_days', 'gov.uk/bank-holidays', v_coverage",
      );
    }
  });
});
