# Customer journey tests

**Status:** Active
**Authority:** How to run the customer portal in a browser against a local database
**Last verified:** 10 November 2026

The customer portal cannot be walked in sample-data mode: it shows "We can't
take online bookings right now". These tests walk it properly. A real browser
drives the real portal against a disposable Supabase stack on your own machine,
built from every committed migration.

Nothing about booking is faked. Sign-in goes through the local auth server.
Bookings, cancellations and reschedules go through the same database functions
and the same three gates as production. A test asserts the row that was
written, not the button that was pressed.

## What it will not do

- **Touch a hosted project.** Every script and the Playwright config refuse a
  Supabase address that is not this machine
  (`scripts/customer-e2e/localTarget.mjs`, with its own test). A `.env.local`
  naming production cannot leak in: the test server is started with an explicit
  environment, which wins over any `.env` file.
- **Use customer data.** Every person, dog and phone number is invented
  (`scripts/customer-e2e/syntheticData.mjs`). The numbers are from Ofcom's
  drama range, 07700 900000 to 900999, which is never given to a subscriber.
- **Send a message.** The local auth server needs an SMS provider configured
  before it allows phone sign-in. It is given a placeholder with no account
  behind it, and each synthetic number has a fixed code.

## What you need

- Docker, running.
- The Supabase CLI. CI pins 2.109.1. A 3.x CLI refuses the copied config with
  `[inbucket] ... is no longer supported`; rename that section to
  `[local_smtp]` in the copied project (never in the repository's own file).
- `psql`.
- Node 24 and `npm ci`.

## Run it

```bash
# 1. Make the disposable project (outside the repository) and start it.
npm run customer-e2e:prepare -- /tmp/customer-e2e-project
supabase --workdir /tmp/customer-e2e-project start

# 2. Run the journeys.
export CUSTOMER_E2E_STACK_DIR=/tmp/customer-e2e-project
npm run customer-e2e

# 3. Throw it away.
supabase --workdir /tmp/customer-e2e-project stop --no-backup
```

The database is reset to the same starting state before every test, so the
order of tests does not matter and a failed run leaves nothing to clean up.
`npm run customer-e2e:seed` performs that reset by hand, which is also how you
get a signed-in customer to click around with: start the app with the local
address and key from `supabase --workdir <dir> status`, then sign in as
07700 900101 with the password in `syntheticData.mjs`.

In CI the same steps run as the **Customer journeys (local stack)** workflow,
on pull requests that touch migrations, the customer portal or these tests. It
holds no hosted credentials. It is not a required check yet.

## Sandboxes that cannot start Edge Functions

The login page first asks the `customer-phone-on-file` Edge Function whether a
phone is known. Some sandboxes cannot start local Edge Functions, because their
containers cannot fetch Deno modules. Only there, set
`CUSTOMER_E2E_STUB_PHONE_CHECK=1` and the browser answers that single lookup
itself. It decides nothing about bookings. CI does not set it.

## What is covered

| Journey | Spec |
|---|---|
| Sign in with phone and password; see only your own dogs | `e2e-customer/sign-in.spec.ts` |
| A wrong password starts no session | `e2e-customer/sign-in.spec.ts` |
| Book a new appointment through all five wizard steps | `e2e-customer/new-booking.spec.ts` |

Still to add, each needing its scenario seeded first: repeat booking,
cancellation and rescheduling with each switch on and off, deadlines, late
cancellation, daily and slot capacity, two customers racing for one slot, and
the wording of each refusal.

## Adding a journey

Put the spec in `e2e-customer/`. Call `resetDatabase` in `test.beforeEach`,
arrange the scenario with `execute(sql)`, sign in with `signIn(page)`, and
assert with `query(sql)`. Add any new synthetic person to `syntheticData.mjs`
so their fixed sign-in code is configured.
