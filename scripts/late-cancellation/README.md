# Local late-cancellation verification

These checks use synthetic records and a disposable PostgreSQL database. They do **not** reproduce the complete Supabase schema, production triggers, RLS or notification integration. Full `npm run test:db`, database concurrency checks and staged acceptance remain release requirements.

Create an empty local database named `late_cancellation_*`. Load `isolated-schema.sql` once into a fresh cluster (it creates the standard anon/authenticated/service roles), then load `supabase/migrations/20261001160000_late_cancellation_history.sql`. Run `isolated-assertions.sql` with `psql -X -v ON_ERROR_STOP=1`; it rolls its fixtures back.

Run the committed-row race against the empty disposable database:

```sh
python3 scripts/late-cancellation/concurrency.py --port 55439 --database late_cancellation_verify
```

The race runner only connects to `127.0.0.1`, refuses other database names and refuses a database containing bookings. It retains its synthetic committed rows for inspection. Both competing requests must leave two cancelled dog rows, one appointment incident and one cancellation receipt.

Full-schema coverage lives in `supabase/tests/235_late_cancellation_history.test.sql`; the existing cancellation deadline cases in test 110 now expect late cancellation to succeed. Rescheduling cases retain the old deadline.
