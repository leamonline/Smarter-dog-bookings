// deno-lint-ignore-file no-explicit-any
//
// A small STATEFUL in-memory stand-in for the supabase client, for tests of the SMS
// delivery write path (smsDelivery.test.ts and the twilio-status endpoint test).
// Updates really change rows and honour their filters (eq / in / not / like), so
// tests assert what ends up STORED (statuses, error text, customer links), not which
// arguments a writer was handed. That is what catches ordering races and half-applied
// retries. Test support only: nothing deployed imports it.

export type Row = Record<string, any>;
export interface Fixture {
  message?: { id: string; status: string; content: string; conversation_id: string | null; error_message?: string | null } | null;
  logs?: Array<{ id: string; human_id: string | null; trigger_type: string | null; status: string; error_message?: string | null }>;
  conversationHuman?: string | null;
  humansOnNumber?: Array<{ id: string; phone: string | null }>;
  todos?: Row[];
  /** Fail the next UPDATE on this table (then behave normally), as a dropped connection would. */
  failNextUpdateOn?: string;
  /** Fail the next INSERT on this table (then behave normally). */
  failNextInsertOn?: string;
  /** Fail the next SELECT on this table (then behave normally). */
  failNextSelectOn?: string;
  /** Runs just before the first UPDATE on a table, to model a concurrent callback landing in between. */
  beforeFirstUpdate?: Record<string, (db: Record<string, Row[]>) => void>;
}

// Identity columns the fixtures don't model per-sid: every row is "SM1 and sms".
const IGNORED = new Set(["meta_message_id", "provider_message_id", "channel"]);

export function fake(fx: Fixture) {
  const db: Record<string, Row[]> = {
    whatsapp_messages: fx.message ? [{ ...fx.message }] : [],
    notification_log: (fx.logs ?? []).map((l) => ({ ...l })),
    humans: (fx.humansOnNumber ?? []).map((h) => ({ ...h, sms_opted_out: false, name: "Wendy", surname: "Rowbottom" })),
    salon_todos: (fx.todos ?? []).map((t) => ({ ...t })),
    whatsapp_conversations: fx.conversationHuman !== undefined || fx.message ? [{ id: "c1", human_id: fx.conversationHuman ?? null }] : [],
  };
  const writes: Array<{ table: string; op: string; values?: Record<string, unknown>; ids?: unknown }> = [];
  const hooks = { ...(fx.beforeFirstUpdate ?? {}) };
  let failNext = fx.failNextUpdateOn;
  let failNextSelect = fx.failNextSelectOn;
  let failNextInsert = fx.failNextInsertOn;
  let nextId = 1;
  const calls: string[] = []; // every table touched, so a test can assert "nothing was read or written"

  const client = {
    from(table: string) {
      calls.push(table);
      const filters: Array<(r: Row) => boolean> = [];
      let op: "select" | "update" = "select";
      let patch: Record<string, unknown> = {};
      let limitN: number | undefined;
      const rows = () => {
        const m = db[table].filter((r) => filters.every((f) => f(r)));
        return limitN === undefined ? m : m.slice(0, limitN);
      };
      const run = () => {
        if (op === "update") {
          if (hooks[table]) { hooks[table](db); delete hooks[table]; }
          if (failNext === table) { failNext = undefined; return { data: null, error: { message: "connection dropped" } }; }
          const matched = rows();
          for (const r of matched) Object.assign(r, patch);
          if (matched.length > 0) writes.push({ table, op: "update", values: patch, ids: matched.map((r) => r.id) });
          return { data: matched.map((r) => ({ id: r.id })), error: null };
        }
        if (failNextSelect === table) { failNextSelect = undefined; return { data: null, error: { message: "connection dropped" } }; }
        return { data: rows(), error: null };
      };
      const q: any = {
        select() { return q; },
        eq(c: string, v: unknown) { if (!IGNORED.has(c)) filters.push((r) => r[c] === v); return q; },
        in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return q; },
        not(c: string, op: string, v: unknown) {
          if (op === "is" && v === null) { filters.push((r) => r[c] !== null && r[c] !== undefined); return q; }
          const set = String(v).replace(/[()]/g, "").split(",");
          filters.push((r) => !set.includes(String(r[c])));
          return q;
        },
        like(c: string, pattern: string) {
          const re = new RegExp("^" + pattern.split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
          filters.push((r) => re.test(String(r[c] ?? "")));
          return q;
        },
        gte() { return q; }, order() { return q; }, filter() { return q; },
        limit(n: number) { limitN = n; return q; },
        update(values: Record<string, unknown>) { op = "update"; patch = values; return q; },
        insert(values: Record<string, unknown>) {
          if (failNextInsert === table) { failNextInsert = undefined; return Promise.resolve({ error: { message: "connection dropped" } }); }
          db[table].push({ id: `new${nextId++}`, ...values });
          writes.push({ table, op: "insert", values });
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          const { data, error } = run();
          if (error) return Promise.resolve({ data: null, error });
          if (table === "humans") return Promise.resolve({ data: (data as Row[])[0] ?? { name: "Wendy", surname: "Rowbottom" }, error: null });
          if (table === "salon_todos") return Promise.resolve({ data: { sort_order: db.salon_todos.length }, error: null });
          return Promise.resolve({ data: (data as Row[])[0] ?? null, error: null });
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { client, db, writes, calls, todos: () => writes.filter((w) => w.table === "salon_todos" && w.op === "insert") };
}
