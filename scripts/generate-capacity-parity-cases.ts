// Emit pgTAP blocks for capacity-parity fixtures, measuring PostgreSQL rather
// than guessing at it.
//
// supabase/tests/036_capacity_parity.test.sql has to state its expectation
// inline because pgTAP cannot call TypeScript, and every `throws_ok` needs the
// database's EXACT message. Both halves were originally produced by hand. This
// script does it mechanically instead: it takes the engine's answer from
// src/engine/capacity.ts, observes the database's answer by attempting the
// insert inside a rolled-back transaction, and prints blocks in the file's
// existing shape.
//
//   npx tsx scripts/generate-capacity-parity-cases.ts <fixture-id> [<fixture-id> ...]
//
// It prints to stdout and writes nothing, so the operator reviews the blocks
// before they are appended and the plan() count is updated. It needs the local
// Supabase stack running (see CLAUDE.md); PGURL overrides the connection.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { canBookSlot, findGroupedSlots } from "../src/engine/capacity";
import { buildSlotGrid } from "../src/engine/slotGrid";
import {
  CAPACITY_PARITY_FIXTURES,
  capFor,
  type CapacityParityFixture,
} from "../src/engine/capacityParityFixtures";

const PGURL = process.env.PGURL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DATE = "2099-01-05";
const PREFIX: Record<string, string> = {
  small: "61510000-0000-4000-8000-",
  medium: "61530000-0000-4000-8000-",
  large: "61520000-0000-4000-8000-",
};

const dogId = (size: string, n: number) => `${PREFIX[size]}${String(n).padStart(12, "0")}`;

/** One insertable case: the setup its day needs, and the rows to attempt. */
interface Case {
  id: string;
  comment: string;
  rows: Array<{ slot: string; size: string; dog: string }>;
  fixture: CapacityParityFixture;
  kind: "single" | "offer" | "naive";
}

function setupSql(f: CapacityParityFixture): string {
  const lines = [
    "set local session_replication_role = replica;",
    `delete from public.bookings where booking_date = date '${DATE}';`,
    `update public.day_settings set overrides = '${JSON.stringify(f.overrides ?? {})}'::jsonb, ` +
      `extra_slots = '{${(f.extraSlots ?? []).map((s) => `"${s}"`).join(",")}}'::text[] ` +
      `where setting_date = date '${DATE}';`,
    `update public.salon_config set daily_dog_cap = ${capFor(f)};`,
  ];
  f.existing.forEach((b, i) => {
    lines.push(
      `insert into public.bookings (booking_date, slot, dog_id, size, service) values ` +
        `(date '${DATE}', '${b.slot}', '${dogId(b.size, i + 1)}', '${b.size}', 'full-groom');`,
    );
  });
  lines.push("set local session_replication_role = default;");
  return lines.join("\n");
}

const valuesSql = (rows: Case["rows"]) =>
  rows
    .map((r) => `(date '${DATE}', '${r.slot}', '${r.dog}', '${r.size}', 'full-groom')`)
    .join(",\n            ");

function buildCases(ids: string[]): Case[] {
  const out: Case[] = [];
  for (const id of ids) {
    const f = CAPACITY_PARITY_FIXTURES.find((x) => x.id === id);
    if (!f) throw new Error(`no fixture with id ${id}`);
    const grid = buildSlotGrid(f.extraSlots ?? []);
    const existing = f.existing.map((b, i) => ({
      id: `existing-${i}`,
      dog_id: `existing-dog-${i}`,
      slot: b.slot,
      size: b.size,
    })) as never[];

    if (f.kind === "single") {
      out.push({
        id: f.id,
        comment: f.description,
        rows: [{ slot: f.candidate.slot, size: f.candidate.size, dog: dogId(f.candidate.size, 31) }],
        fixture: f,
        kind: "single",
      });
      continue;
    }

    const dogs = f.dogs.map((size, i) => ({ id: `group-dog-${i}`, size }));
    const offers = findGroupedSlots(dogs, existing, grid, capFor(f), f.overrides ?? {});

    offers.forEach((allocation, n) => {
      out.push({
        id: `${f.id}#${n}`,
        comment: f.description,
        rows: allocation.assignments.map((a) => {
          const idx = Number(a.dogId.split("-").pop());
          return { slot: a.slot, size: f.dogs[idx], dog: dogId(f.dogs[idx], 31 + idx) };
        }),
        fixture: f,
        kind: "offer",
      });
    });

    if (offers.length === 0) {
      // The engine offered nothing. Attempt a plain placement anyway — two dogs
      // per slot walking the grid — to show whether the database would have
      // taken one. The engine being stricter than the database costs bookings.
      const rows = f.dogs.map((size, i) => ({
        slot: grid[Math.floor(i / 2)],
        size,
        dog: dogId(size, 31 + i),
      }));
      out.push({ id: `${f.id}#naive`, comment: f.description, rows, fixture: f, kind: "naive" });
    }
  }
  return out;
}

/** Ask the database what it does, one rolled-back subtransaction per case. */
function observe(cases: Case[]): Map<string, { allowed: boolean; message: string }> {
  // The same fixture preamble 036_capacity_parity.test.sql builds, so the
  // observed answers come from the state the generated blocks will run in.
  // Without the dogs, every insert fails on the dog-availability gate rather
  // than on capacity, and the measurement would be of the wrong thing.
  const probe = [
    "begin;",
    "\\ir fixtures/ensure_local_vault_secrets.psql",
    "set local session_replication_role = replica;",
    "insert into auth.users (id) values ('61500000-0000-4000-8000-000000000001');",
    `insert into public.humans (
       id, name, surname, address, customer_user_id, source,
       approved_at, policies_accepted_at, policies_version
     ) values (
       '61500000-0000-4000-8000-000000000010', 'Parity', 'Harness',
       '1 Parity Street', '61500000-0000-4000-8000-000000000001',
       'existing', now(), now(), '2099-parity'
     );`,
    ...Object.entries({ small: "61510000", medium: "61530000", large: "61520000" }).map(
      ([size, prefix]) =>
        `insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
         select ('${prefix}-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'Parity${size}'||i,
                'Poodle', '61500000-0000-4000-8000-000000000010', '${size}', false
         from generate_series(1, 60) as f(i);`,
    ),
    "delete from public.salon_config;",
    `insert into public.salon_config (id, enforce_server_capacity, daily_dog_cap)
     values ('61500000-0000-4000-8000-0000000000c0', true, 14);`,
    `insert into public.day_settings (setting_date, is_open, overrides, extra_slots)
     values (date '${DATE}', true, '{}'::jsonb, '{}');`,
    "set local session_replication_role = default;",
    "select set_config('request.jwt.claims','',true);",
    "set local role postgres;",
  ];
  for (const c of cases) {
    probe.push(setupSql(c.fixture));
    probe.push(`do $probe$ begin
  begin
    insert into public.bookings (booking_date, slot, dog_id, size, service) values
            ${valuesSql(c.rows)};
    raise notice 'OBS|${c.id}|ALLOW|';
  exception when others then raise notice 'OBS|${c.id}|REFUSE|%', sqlerrm;
  end;
end $probe$;`);
  }
  probe.push("rollback;");

  const path = process.env.PROBE_PATH ?? "/tmp/parity-probe.sql";
  writeFileSync(path, probe.join("\n"));
  // psql writes RAISE NOTICE to stderr, so both streams matter here.
  const run = spawnSync("psql", [PGURL, "-q", "-f", path], { encoding: "utf8" });
  if (run.error) throw run.error;
  const out = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;

  const seen = new Map<string, { allowed: boolean; message: string }>();
  for (const line of out.split("\n")) {
    const m = line.match(/OBS\|([^|]+)\|(ALLOW|REFUSE)\|(.*)$/);
    if (m) seen.set(m[1], { allowed: m[2] === "ALLOW", message: m[3].trim() });
  }
  return seen;
}

function render(c: Case, observed: { allowed: boolean; message: string }): string {
  const description =
    c.kind === "single"
      ? `parity[${c.id}]: engine and PostgreSQL must agree`
      : c.kind === "offer"
        ? `parity[${c.id}]: the engine offers this allocation, so PostgreSQL must accept it`
        : `parity[${c.id}]: the engine offered nothing; PostgreSQL must refuse a plain placement too`;

  const insert =
    `  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)\n` +
    `     values ${valuesSql(c.rows)} $$,`;

  const assertion = observed.allowed
    ? `select lives_ok(\n${insert}\n  '${description}'\n);`
    : `select throws_ok(\n${insert}\n  'P0001',\n  '${observed.message.replace(/'/g, "''")}',\n  '${description}'\n);`;

  return `-- ${c.id}: ${c.comment}\n${setupSql(c.fixture)}\n${assertion}\n`;
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("usage: generate-capacity-parity-cases.ts <fixture-id> [...]");
  process.exit(1);
}

const cases = buildCases(ids);
const observed = observe(cases);

let mismatches = 0;
const blocks: string[] = [];
for (const c of cases) {
  const o = observed.get(c.id);
  if (!o) throw new Error(`no observation for ${c.id} — did the probe run?`);

  // Report, but do not hide, a disagreement. An offer the database refuses is
  // exactly what this harness exists to surface; it belongs in the divergence
  // register with an explanation, not quietly in a generated throws_ok.
  if (c.kind === "offer" && !o.allowed) {
    console.error(`DIVERGENCE: ${c.id} is offered by the engine and refused by PostgreSQL: ${o.message}`);
    mismatches += 1;
  }

  // A single scenario is a straight verdict match, so disagreement is just as
  // reportable — and cheaper to notice here than in the pgTAP run.
  if (c.kind === "single" && c.fixture.kind === "single") {
    const engine = canBookSlot(
      c.fixture.existing.map((b, i) => ({
        id: `existing-${i}`,
        dog_id: `existing-dog-${i}`,
        slot: b.slot,
        size: b.size,
      })) as never[],
      c.fixture.candidate.slot,
      c.fixture.candidate.size,
      buildSlotGrid(c.fixture.extraSlots ?? []),
      { overrides: (c.fixture.overrides ?? {})[c.fixture.candidate.slot], dogId: "candidate-dog" },
    );
    if (engine.allowed !== o.allowed) {
      console.error(
        `DIVERGENCE: ${c.id} — engine ${engine.allowed ? "allows" : "refuses"} ` +
          `(${engine.reason ?? "-"}), PostgreSQL ${o.allowed ? "allows" : "refuses"} (${o.message})`,
      );
      mismatches += 1;
    }
  }
  blocks.push(render(c, o));
}

console.log(blocks.join("\n"));
console.error(`\n${cases.length} case(s) generated, ${mismatches} divergence(s).`);
