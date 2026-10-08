# Dog size confirmation

A dog with no size on its record (`dogs.size` is null) cannot be booked
online. That is deliberate and unchanged: size decides how many seats a
booking takes, so staff are the only authority on it. A customer's own guess
is kept separately as `dogs.reported_size` and is never used for capacity or
price (migration `20260712115759_legal_risk_tranche1`).

This page covers what happens while a customer waits for that confirmation:
who is told what, and how the request reaches staff and is cleared. Migration
`20261008120000_dog_size_check_todo` holds the database side.

## The key point: nothing here sets a size

No code path in this feature writes `dogs.size` from customer input. It adds a
staff to-do and some wording. The booking gates, the capacity engine, pricing
and `create_customer_booking_group` (which still raises `dog_size_unconfirmed`
for an unsized dog) are unchanged.

## When a request is raised

A "Confirm size" to-do is written or refreshed when:

| Trigger | Where |
|---|---|
| A signed-in customer adds a dog, or changes its breed or estimate, and the dog ends up with no size | AFTER trigger on `dogs` |
| The booking wizard shows the customer a dog it cannot book | `request_dog_size_check(dog)`, called once per dog per visit |

It is only raised for an **approved** customer's **live** (not archived) dog.
An unapproved signup is already covered by its `signup_review` task, and
approval itself needs every size set. Staff and service-role writes never
create one, though they do refresh an open one's wording.

There is at most one open to-do per dog (`salon_todos.dog_id`, partial unique
index). Repeats refresh the text rather than stacking.

## What the to-do says

> Confirm size: Bramble (Pug x Labrador) — Jane Smith thinks medium. They can't
> book online until it's set.

The to-do list shows only this stored text, so it is kept current: renaming the
dog or the owner, correcting the breed, or moving the dog to another owner
(including `merge_humans`) rewrites it, and a moved dog takes its to-do with it.

It is an ordinary `general` task, so staff tick it off like any other.

## How staff resolve it

- **Set the size** by any route (the dog card's edit form, a booking, an
  import). The to-do ticks itself off.
- **Confirm the owner's estimate in one tap**: when a dog has no size but the
  owner gave one, the dog card shows "Confirm Medium". It writes through the
  ordinary staff dog update, guarded so it only lands while the dog is still
  unsized with that same estimate. If the dog changed since the card opened,
  staff are told to reopen it rather than overwriting the newer value.
- **Archive the dog**: the to-do ticks itself off.

A ticked-off size check cannot be reopened once the dog has a size or is
archived, because no later dog write would close it again.

## What the customer is told

| Situation | Wizard wording |
|---|---|
| Request recorded | Row: "We're confirming their size". Note: "We've asked the team to confirm Bella's size. You can book online once it's set — or if you'd rather not wait, message us on WhatsApp." |
| Request failed, or nothing to record (an archived dog) | Row: "Size not confirmed — message us first", with the WhatsApp link |
| Dog is also pregnant | The size request still goes to staff, but the note never promises online booking: a pregnant dog needs a chat first whatever its size |

The wizard says "we've asked the team" only when the server reports that a
to-do is open (`request_dog_size_check` returns `true`). It makes no promise
about how quickly staff will confirm.

## Concurrency

- The writer locks the dog row before deciding, so a request racing a staff
  size edit or archive waits for it and then sees the result.
- The customer RPC locks the caller's own owner row before the dog: the order
  `merge_humans` and the customer dog RPCs use, so they cannot deadlock.
- Under the dog lock, the writer re-checks that the dog still belongs to the
  caller.

`supabase/tests/239_dog_size_check_todo.test.sql` covers the lifecycle;
`supabase/tests/240_dog_size_check_race.test.sql` covers the races with two
real database sessions.

## Not covered

The WhatsApp booking Flow still shows an unsized dog with no services and does
not raise a to-do. It could call the same RPC if that turns out to matter.
