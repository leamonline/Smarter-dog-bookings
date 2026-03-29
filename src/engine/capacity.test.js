/**
 * Capacity Engine Tests
 *
 * Run: node src/engine/capacity.test.js
 *
 * Tests cover:
 * 1. Basic 2-2-1 rule
 * 2. Start-of-day exception (08:30, 09:00)
 * 3. 12:00 large dog sharing + early close
 * 4. Back-to-back large dogs (12:30 + 13:00 only)
 * 5. Mid-morning block
 * 6. Edge cases and interactions
 */

import {
  getSeatsNeeded,
  getSeatsUsed,
  hasLargeDog,
  getMaxSeatsForSlot,
  isEarlyCloseActive,
  computeSlotCapacities,
  canBookSlot,
  getBookableSeatCount,
  findGroupedSlots,
} from "./capacity.js";

const SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

// Helper: create a booking
function b(slot, size = "small", id = null) {
  return {
    id: id || Date.now() + Math.random(),
    slot,
    size,
    dogName: "Test",
    breed: "Test",
    service: "full-groom",
    owner: "Test",
  };
}

// ============================================================
// 1. SEATS NEEDED
// ============================================================
section("Seats Needed");

assert(getSeatsNeeded("small", "08:30") === 1, "Small dog = 1 seat");
assert(getSeatsNeeded("medium", "09:00") === 1, "Medium dog = 1 seat");
assert(getSeatsNeeded("large", "08:30") === 1, "Large dog at 08:30 = 1 seat (start-of-day)");
assert(getSeatsNeeded("large", "09:00") === 1, "Large dog at 09:00 = 1 seat (start-of-day)");
assert(getSeatsNeeded("large", "12:00") === 1, "Large dog at 12:00 = 1 seat (shareable)");
assert(getSeatsNeeded("large", "12:30") === 2, "Large dog at 12:30 = 2 seats (full takeover)");
assert(getSeatsNeeded("large", "13:00") === 2, "Large dog at 13:00 = 2 seats (full takeover)");
assert(getSeatsNeeded("large", "10:00") === 2, "Large dog at 10:00 = 2 seats (no LARGE_DOG_SLOTS entry)");

// ============================================================
// 2. BASIC 2-2-1 RULE
// ============================================================
section("2-2-1 Rule");

{
  // 2, 2, ? — third must cap at 1
  const bookings = [
    b("08:30"), b("08:30"),
    b("09:00"), b("09:00"),
  ];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["09:30"].max === 1, "After two doubles, next caps at 1");
  assert(caps["09:30"].isConstrained === true, "09:30 should be constrained");
}

{
  // 2, 2, 0, 2, 2 — empty resets chain
  const bookings = [
    b("08:30"), b("08:30"),
    b("09:00"), b("09:00"),
    // 09:30 empty
    b("10:00"), b("10:00"),
    b("10:30"), b("10:30"),
  ];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["09:30"].max === 1, "09:30 capped (after 2,2)");
  assert(caps["11:00"].max === 1, "11:00 capped (after 10:00,10:30 doubles)");
}

{
  // Bidirectional: ?, 2, 2 — ? caps at 1
  const bookings = [
    b("09:00"), b("09:00"),
    b("09:30"), b("09:30"),
  ];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["08:30"].max === 1, "08:30 capped looking forward at two doubles");
}

{
  // 2, 1, 2, 2 — the state is valid, but 09:00's MAX is correctly
  // capped at 1 because allowing 2 would create 2,2,2 (08:30-09:30).
  // The existing 1 dog is fine, but no second booking should be allowed.
  const bookings = [
    b("08:30"), b("08:30"),
    b("09:00"),
    b("09:30"), b("09:30"),
    b("10:00"), b("10:00"),
  ];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["09:00"].max === 1, "09:00 capped at 1 (between doubles on both sides)");
  assert(caps["09:00"].available === 0, "09:00 has 0 available (1 used, max 1)");
  assert(caps["10:30"].max === 1, "10:30 capped after 09:30,10:00 doubles");
}

// ============================================================
// 3. EARLY CLOSE
// ============================================================
section("Early Close (12:00 large dog closes 13:00)");

{
  const bookings = [b("12:00", "large")];
  assert(isEarlyCloseActive(bookings) === true, "Early close active when 12:00 has large dog");
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["13:00"].max === 0, "13:00 max = 0 with early close");
  assert(caps["13:00"].available === 0, "13:00 available = 0 with early close");
  assert(caps["13:00"].isEarlyClosed === true, "13:00 flagged as early closed");
}

{
  const bookings = [b("12:00", "small")];
  assert(isEarlyCloseActive(bookings) === false, "No early close when 12:00 has small dog");
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["13:00"].max === 2, "13:00 max = 2 without early close");
}

{
  // Early close + 12:30 large = 13:00 still closed
  const bookings = [b("12:00", "large"), b("12:30", "large")];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["13:00"].max === 0, "13:00 still closed with 12:00 large + 12:30 large");
  assert(caps["12:30"].used === 2, "12:30 has 2 seats used (full takeover)");
}

{
  // Early close self-heals: no large at 12:00
  const bookings = [b("12:00", "small"), b("12:00", "medium")];
  assert(isEarlyCloseActive(bookings) === false, "No early close with two small/medium at 12:00");
}

// ============================================================
// 4. 12:00 LARGE DOG CONDITIONAL
// ============================================================
section("12:00 Large Dog Conditional (13:00 must be empty)");

{
  // 13:00 empty — should allow
  const bookings = [];
  const result = canBookSlot(bookings, "12:00", "large", SLOTS);
  assert(result.allowed === true, "Large dog at 12:00 allowed when 13:00 is empty");
}

{
  // 13:00 has a booking — should block
  const bookings = [b("13:00", "small")];
  const result = canBookSlot(bookings, "12:00", "large", SLOTS);
  assert(result.allowed === false, "Large dog at 12:00 blocked when 13:00 has bookings");
  assert(result.reason.includes("early close"), "Reason mentions early close");
}

{
  // 13:00 has a large dog — should block
  const bookings = [b("13:00", "large")];
  const result = canBookSlot(bookings, "12:00", "large", SLOTS);
  assert(result.allowed === false, "Large dog at 12:00 blocked when 13:00 has large dog");
}

{
  // 12:00 can share with small/medium
  const bookings = [b("12:00", "large")];
  const result = canBookSlot(bookings, "12:00", "small", SLOTS);
  assert(result.allowed === true, "Small dog can share 12:00 with large dog");
}

{
  // 12:00 large + small already there — slot full
  const bookings = [b("12:00", "large"), b("12:00", "small")];
  const result = canBookSlot(bookings, "12:00", "small", SLOTS);
  assert(result.allowed === false, "12:00 full with large + small");
}

// ============================================================
// 5. 13:00 EARLY CLOSE CHECK
// ============================================================
section("13:00 Blocked by Early Close");

{
  // 12:00 has large → 13:00 blocked for everything
  const bookings = [b("12:00", "large")];

  const resultSmall = canBookSlot(bookings, "13:00", "small", SLOTS);
  assert(resultSmall.allowed === false, "Small dog at 13:00 blocked by early close");

  const resultLarge = canBookSlot(bookings, "13:00", "large", SLOTS);
  assert(resultLarge.allowed === false, "Large dog at 13:00 blocked by early close");
}

{
  // 12:00 has small — 13:00 open
  const bookings = [b("12:00", "small")];
  const result = canBookSlot(bookings, "13:00", "small", SLOTS);
  assert(result.allowed === true, "13:00 open when 12:00 has only small dogs");
}

// ============================================================
// 6. BACK-TO-BACK LARGE DOGS
// ============================================================
section("Back-to-Back Large Dogs");

{
  // 12:30 + 13:00 — the only permitted pair
  const bookings = [b("12:30", "large")];
  const result = canBookSlot(bookings, "13:00", "large", SLOTS);
  assert(result.allowed === true, "Back-to-back large at 12:30 + 13:00 allowed");
}

{
  // 13:00 first, then 12:30
  const bookings = [b("13:00", "large")];
  const result = canBookSlot(bookings, "12:30", "large", SLOTS);
  assert(result.allowed === true, "Back-to-back large at 12:30 + 13:00 allowed (reverse order)");
}

{
  // 12:30 + 13:00 blocked if 12:00 has large (early close)
  const bookings = [b("12:00", "large"), b("12:30", "large")];
  const result = canBookSlot(bookings, "13:00", "large", SLOTS);
  assert(result.allowed === false, "Back-to-back at 12:30+13:00 blocked by early close");
}

// ============================================================
// 7. START-OF-DAY EXCEPTION
// ============================================================
section("Start-of-Day Exception (08:30, 09:00)");

{
  // Large at 08:30 — 1 seat, can share
  const bookings = [];
  const result = canBookSlot(bookings, "08:30", "large", SLOTS);
  assert(result.allowed === true, "Large dog at 08:30 allowed");
}

{
  // Large at 08:30 + small at 08:30 — allowed
  const bookings = [b("08:30", "large")];
  const result = canBookSlot(bookings, "08:30", "small", SLOTS);
  assert(result.allowed === true, "Small dog can share 08:30 with large dog");
}

{
  // Two large dogs at 08:30 — second large blocked
  // "remaining seat can only be booked by small/medium"
  const bookings = [b("08:30", "large")];
  const result = canBookSlot(bookings, "08:30", "large", SLOTS);
  assert(result.allowed === false, "Second large dog can't share 08:30 with first large");
}

{
  // Same rule at 12:00
  const bookings = [b("12:00", "large")];
  const result = canBookSlot(bookings, "12:00", "large", SLOTS);
  assert(result.allowed === false, "Second large dog can't share 12:00 with first large");
}

{
  // 09:00 conditional: 08:30 must be empty
  const bookings = [b("08:30", "small")];
  const result = canBookSlot(bookings, "09:00", "large", SLOTS);
  assert(result.allowed === false, "09:00 large blocked when 08:30 has bookings");
}

{
  // 09:00 conditional: 08:30 empty, 10:00 has ≤1 — allowed
  const bookings = [b("10:00", "small")];
  const result = canBookSlot(bookings, "09:00", "large", SLOTS);
  assert(result.allowed === true, "09:00 large allowed when 08:30 empty and 10:00 has 1");
}

{
  // 09:00 conditional: 10:00 has 2 seats — blocked
  const bookings = [b("10:00", "small"), b("10:00", "small")];
  const result = canBookSlot(bookings, "09:00", "large", SLOTS);
  assert(result.allowed === false, "09:00 large blocked when 10:00 has 2 seats");
}

// ============================================================
// 8. MID-MORNING BLOCK
// ============================================================
section("Mid-Morning Block (10:00 - 11:30)");

{
  const midSlots = ["10:00", "10:30", "11:00", "11:30"];
  for (const slot of midSlots) {
    const result = canBookSlot([], slot, "large", SLOTS);
    assert(result.allowed === false, `Large dog blocked at ${slot}`);
    assert(result.needsApproval === true, `${slot} needs approval flag set`);
  }
}

{
  // Small/medium should be fine at mid-morning
  const result = canBookSlot([], "10:00", "small", SLOTS);
  assert(result.allowed === true, "Small dog at 10:00 allowed");
}

// ============================================================
// 9. FULL-TAKEOVER SLOT RULES (12:30, 13:00)
// ============================================================
section("Full-Takeover Slots (12:30, 13:00)");

{
  // Large at 12:30 fills both seats
  const bookings = [b("12:30", "large")];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["12:30"].used === 2, "Large at 12:30 uses 2 seats");
  assert(caps["12:30"].available === 0, "12:30 has 0 available after large dog");
}

{
  // Can't add small to 12:30 with large dog
  const bookings = [b("12:30", "large")];
  const result = canBookSlot(bookings, "12:30", "small", SLOTS);
  assert(result.allowed === false, "Small dog can't share 12:30 with large (canShare: false)");
}

{
  // Large at 13:00 fills both seats
  const bookings = [];
  const result = canBookSlot(bookings, "13:00", "large", SLOTS);
  assert(result.allowed === true, "Large dog at 13:00 allowed when slot empty");
}

{
  // 12:30 with existing booking — large blocked
  const bookings = [b("12:30", "small")];
  const result = canBookSlot(bookings, "12:30", "large", SLOTS);
  assert(result.allowed === false, "Large at 12:30 blocked when slot has bookings");
}

// ============================================================
// 10. COMBINED SCENARIOS
// ============================================================
section("Combined Scenarios");

{
  // Realistic busy day: 2,2,1,2,2,0,0,large@12:00,0,0
  const bookings = [
    b("08:30"), b("08:30"),
    b("09:00"), b("09:00"),
    b("09:30"),
    b("10:00"), b("10:00"),
    b("10:30"), b("10:30"),
    b("12:00", "large"),
  ];
  const caps = computeSlotCapacities(bookings, SLOTS);

  assert(caps["09:30"].max === 1, "09:30 capped at 1 (between two doubles)");
  assert(caps["11:00"].max === 1, "11:00 capped at 1 (after 10:00,10:30 doubles)");
  assert(caps["12:00"].used === 1, "12:00 has 1 seat used (large, canShare)");
  assert(caps["12:00"].available === 1, "12:00 has 1 seat available for small/medium");
  assert(caps["13:00"].max === 0, "13:00 closed by early close");
  assert(caps["12:30"].max === 2, "12:30 unaffected by early close");
}

{
  // 12:00 large + 12:00 small + 12:30 large — valid combo
  const bookings = [
    b("12:00", "large"),
    b("12:00", "small"),
  ];
  const result = canBookSlot(bookings, "12:30", "large", SLOTS);
  assert(result.allowed === true, "Large at 12:30 allowed with 12:00 large+small");
}

{
  // Full afternoon scenario: 12:00 large+small, 12:30 large, 13:00 should be blocked
  const bookings = [
    b("12:00", "large"),
    b("12:00", "small"),
    b("12:30", "large"),
  ];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["13:00"].max === 0, "13:00 closed (12:00 large triggered early close)");
  assert(caps["12:30"].available === 0, "12:30 full (large takes both seats)");
  assert(caps["12:00"].available === 0, "12:00 full (large + small)");
}

{
  // Small/medium dog at 13:00 when early close NOT active
  const bookings = [b("12:00", "small")];
  const result = canBookSlot(bookings, "13:00", "small", SLOTS);
  assert(result.allowed === true, "Small at 13:00 allowed without early close");
}

// ============================================================
// 11. STAFF OVERRIDES
// ============================================================
section("Staff Overrides");

{
  // Staff blocks a seat — reduces available
  const bookings = [];
  const overrides = { 0: "blocked" };
  const count = getBookableSeatCount(bookings, "10:00", SLOTS, overrides);
  assert(count === 1, "Staff-blocked seat reduces available by 1");
}

{
  // Staff opens a 2-2-1 blocked seat
  const bookings = [
    b("08:30"), b("08:30"),
    b("09:00"), b("09:00"),
  ];
  // 09:30 should be capped at 1 by 2-2-1
  const overrides = { 1: "open" };
  const count = getBookableSeatCount(bookings, "09:30", SLOTS, overrides);
  assert(count === 2, "Staff-opened seat overrides 2-2-1 cap");
}

// ============================================================
// 12. EARLY CLOSE + 2-2-1 INTERACTION
// ============================================================
section("Early Close + 2-2-1 Interaction");

{
  // Even if 2-2-1 would give 13:00 max=2, early close overrides to 0
  const bookings = [b("12:00", "large")];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["13:00"].max === 0, "Early close overrides 2-2-1 for 13:00");
}

{
  // 12:30 double + early close = 13:00 still 0
  const bookings = [
    b("12:00", "large"),
    b("12:30", "small"), b("12:30", "small"),
  ];
  const caps = computeSlotCapacities(bookings, SLOTS);
  assert(caps["13:00"].max === 0, "13:00 max = 0 despite 12:30 double (early close)");
}

// ============================================================
// MULTI-DOG SLOT GROUPING
// ============================================================
section("MULTI-DOG SLOT GROUPING");

function dogs(sizes) {
  return sizes.map((size, i) => ({ id: `dog-${i}`, size }));
}

// 1 small dog finds slots
{
  const result = findGroupedSlots(dogs(["small"]), [], SLOTS);
  assert(result.length > 0, "1 small dog should find available slots");
  assert(result[0].assignments.length === 1, "1 dog = 1 assignment");
  assert(result[0].dropOffTime === result[0].assignments[0].slot, "1 dog: dropoff = slot");
}

// 2 dogs same slot
{
  const result = findGroupedSlots(dogs(["small", "small"]), [], SLOTS);
  assert(result.length > 0, "2 small dogs should find available slots");
  assert(result[0].assignments.length === 2, "2 dogs = 2 assignments");
  assert(result[0].assignments[0].slot === result[0].assignments[1].slot, "2 dogs in same slot");
}

// 3 dogs across 2 slots
{
  const result = findGroupedSlots(dogs(["small", "small", "small"]), [], SLOTS);
  assert(result.length > 0, "3 small dogs should find slots");
  assert(result[0].assignments.length === 3, "3 dogs = 3 assignments");
  const uniqueSlots = [...new Set(result[0].assignments.map(a => a.slot))];
  assert(uniqueSlots.length === 2, "3 dogs use 2 different slots");
}

// 4 dogs across 2 slots
{
  const result = findGroupedSlots(dogs(["small", "small", "small", "small"]), [], SLOTS);
  assert(result.length > 0, "4 small dogs should find slots");
  assert(result[0].assignments.length === 4, "4 dogs = 4 assignments");
  const uniqueSlots = [...new Set(result[0].assignments.map(a => a.slot))];
  assert(uniqueSlots.length === 2, "4 dogs use 2 different slots");
}

// Full day returns empty
{
  const fullBookings = SLOTS.flatMap(slot => [b(slot, "small"), b(slot, "small")]);
  const result = findGroupedSlots(dogs(["small"]), fullBookings, SLOTS);
  assert(result.length === 0, "Full day should return no slots");
}

// Drop-off is earlier slot
{
  const result = findGroupedSlots(dogs(["small", "small", "small"]), [], SLOTS);
  if (result.length > 0) {
    const assignedSlots = result[0].assignments.map(a => a.slot).sort();
    assert(result[0].dropOffTime === assignedSlots[0], "Drop-off = earlier slot");
  }
}

// 0 or 5+ dogs returns empty
{
  assert(findGroupedSlots([], [], SLOTS).length === 0, "0 dogs = empty");
  assert(findGroupedSlots(dogs(["small","small","small","small","small"]), [], SLOTS).length === 0, "5 dogs = empty");
}

// ============================================================
// RESULTS
// ============================================================
console.log(`\n============================================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`============================================================`);

if (failed > 0) {
  process.exit(1);
}
