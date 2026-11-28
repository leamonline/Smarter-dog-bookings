# £10 deposits from the iPhone app

**Status:** Built, switched off
**Authority:** How an app deposit is taken, refunded, kept or carried

Some customers are asked for a £10 deposit after a missed appointment. The
salon already marks that on the customer (`humans.deposit_required`) and stamps
it onto each new booking. This adds the payment itself, taken in the iPhone
app with Apple Pay or a card, through Square.

It is a payment for a grooming appointment. It is not an App Store purchase.

The iPhone app does not call this yet. The switch ships off, so deploying the
code changes nothing for customers or for the existing bank-transfer deposit
until someone turns it on.

## What happens to the £10

The salon's existing cancellation notice is the line. That is 24 hours before
the appointment unless staff have changed **Minimum cancellation notice** in
settings. Exactly on that deadline still counts as enough notice.

| What happened | The £10 |
| --- | --- |
| Customer cancels with the full notice | Refunded |
| Customer cancels after the deadline | Kept |
| Customer does not show up | Kept |
| Appointment is moved | Kept, and it stays on the new appointment |
| Salon cancels, or the cancellation has no customer cause | Refunded |
| Staff waive it before it is paid | Not taken. That booking will not be auto-cancelled for an unpaid deposit. The customer is still asked next time. |
| Staff refund it | Sent back, including a £10 the rules had kept |

A payment Square has not confirmed yet is left alone by a cancellation. When
Square later confirms it, the rule above runs against the booking as it stands.

## Turning it on

Do this on the **sandbox** first. Production Square and the live database come
last, and only after a sandbox payment and a sandbox refund have both worked.

1. Apply migration `20261122143000_square_deposit_payments.sql` to the
   database you are testing. Use the usual gated migration workflow. Merging
   this change does **not** apply it, and it must not be applied to production
   until you intend to.
2. In [Square Developer](https://developer.squareup.com/apps), create an
   application. Open its **Sandbox** settings and copy:
   - the sandbox access token
   - the sandbox location id
   - Credentials → Webhooks, create a subscription (or open the sandbox one)
     and copy the **signature key**
3. Set the secrets on the Supabase project you are testing. Replace nothing
   that is already there; these are new names.

   ```bash
   supabase secrets set \
     IOS_DEPOSITS_ENABLED=false \
     SQUARE_ENVIRONMENT=sandbox \
     SQUARE_ACCESS_TOKEN='paste the sandbox token' \
     SQUARE_LOCATION_ID='paste the sandbox location id' \
     SQUARE_WEBHOOK_SIGNATURE_KEY='paste the signature key' \
     SQUARE_WEBHOOK_NOTIFICATION_URL='https://YOUR-PROJECT.supabase.co/functions/v1/square-deposit-webhook'
   ```

   `IOS_DEPOSITS_ENABLED` stays `false` until the webhook URL below is saved.
4. In the Square webhook subscription, set the notification URL to **exactly**
   the same text as `SQUARE_WEBHOOK_NOTIFICATION_URL`. Subscribe to
   `payment.updated` and `refund.updated`. Square signs that exact URL; a
   trailing slash or a different host will be rejected.
5. Deploy the four Edge Functions if a merge has not already deployed them:
   `square-deposit-charge`, `square-deposit-webhook`, `square-deposit-staff`,
   `square-deposit-refund`.
6. Turn the switch on:

   ```bash
   supabase secrets set IOS_DEPOSITS_ENABLED=true
   ```

7. To switch it off again:

   ```bash
   supabase secrets set IOS_DEPOSITS_ENABLED=false
   ```

   New charges stop. A £10 already taken can still be refunded.

Leave `SQUARE_ENVIRONMENT` unset or set it to `sandbox` until you mean to take
live cards. The only value that uses live Square is `production`.

## Sandbox testing

Square's sandbox accepts stand-in nonces. No real card is charged.

- `cnon:card-nonce-ok` — payment succeeds
- `cnon:card-nonce-declined` — payment is declined and the booking stays unpaid

The charge endpoint is `POST /functions/v1/square-deposit-charge` with the
customer's signed-in token and a body `{ "bookingId", "sourceId" }`. `sourceId`
is the nonce. The amount is always £10; the app cannot choose it.

Staff waive and refund: `POST /functions/v1/square-deposit-staff` with a staff
token and `{ "action": "waive" | "refund", "bookingId", "reason" }`.

## What is deliberately not here

- The iPhone screen that shows Apple Pay or the card form. The app still stops
  at sign-in.
- Changing who is asked for a deposit. A no-show still does not, by itself,
  tick `deposit_required`.
- An App Store in-app purchase. Grooming is a service the customer receives in
  person, so the payment goes through Square, not Apple.
