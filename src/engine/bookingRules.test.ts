import { describe, it, expect } from "vitest";

import {
  isServiceSupportedForSize,
  getAllowedServicesForSize,
  normalizeServiceForSize,
  getServicePriceLabel,
  getNumericPrice,
  toLocalDateStr,
  getHumanByIdOrName,
  getDogByIdOrName,
  computeBookingPricing,
  buildMarkPaidPatch,
  resolveBookingDisplay,
  looksLikeUuid,
} from "./bookingRules";

// ── isServiceSupportedForSize ───────────────────────────────────

describe("isServiceSupportedForSize", () => {
  it("returns true for valid service+size combos", () => {
    expect(isServiceSupportedForSize("full-groom", "small")).toBe(true);
    expect(isServiceSupportedForSize("full-groom", "large")).toBe(true);
    expect(isServiceSupportedForSize("bath-and-brush", "medium")).toBe(true);
  });

  it("returns false for N/A combos", () => {
    expect(isServiceSupportedForSize("puppy-groom", "large")).toBe(false);
  });

  it("returns false for unknown services", () => {
    expect(isServiceSupportedForSize("nonexistent", "small")).toBe(false);
  });

  it("returns false for unknown sizes", () => {
    expect(isServiceSupportedForSize("full-groom", "giant")).toBe(false);
  });
});

// ── getAllowedServicesForSize ────────────────────────────────────

describe("getAllowedServicesForSize", () => {
  it("returns all 4 services for small dogs", () => {
    const services = getAllowedServicesForSize("small");
    expect(services.length).toBe(4);
    expect(services.map((s) => s.id)).toContain("puppy-groom");
  });

  it("excludes puppy-groom for large dogs", () => {
    const services = getAllowedServicesForSize("large");
    expect(services.map((s) => s.id)).not.toContain("puppy-groom");
    expect(services.length).toBe(3);
  });

  it("returns empty for unknown size", () => {
    expect(getAllowedServicesForSize("giant")).toEqual([]);
  });
});

// ── normalizeServiceForSize ─────────────────────────────────────

describe("normalizeServiceForSize", () => {
  it("returns the same service if supported", () => {
    expect(normalizeServiceForSize("full-groom", "small")).toBe("full-groom");
  });

  it("falls back to first allowed service if not supported", () => {
    const result = normalizeServiceForSize("puppy-groom", "large");
    expect(result).toBe("full-groom"); // first allowed for large
  });
});

// ── getServicePriceLabel ────────────────────────────────────────

describe("getServicePriceLabel", () => {
  it("returns price string for valid combo", () => {
    expect(getServicePriceLabel("full-groom", "small")).toBe("\u00A342+");
  });

  it("returns N/A for unsupported combo", () => {
    expect(getServicePriceLabel("puppy-groom", "large")).toBe("N/A");
  });

  it("returns N/A for unknown service", () => {
    expect(getServicePriceLabel("nonexistent", "small")).toBe("N/A");
  });
});

// ── getNumericPrice ─────────────────────────────────────────────

describe("getNumericPrice", () => {
  it("extracts number from currency string", () => {
    expect(getNumericPrice("\u00A342+")).toBe(42);
    expect(getNumericPrice("\u00A360+")).toBe(60);
  });

  it("returns number as-is", () => {
    expect(getNumericPrice(55)).toBe(55);
  });

  it("returns 0 for non-numeric string", () => {
    expect(getNumericPrice("N/A")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(getNumericPrice("")).toBe(0);
  });
});

// ── toLocalDateStr ──────────────────────────────────────────────

describe("toLocalDateStr", () => {
  it("formats a Date object as YYYY-MM-DD", () => {
    const d = new Date(2025, 0, 15); // Jan 15, 2025
    expect(toLocalDateStr(d)).toBe("2025-01-15");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2025, 2, 5); // Mar 5, 2025
    expect(toLocalDateStr(d)).toBe("2025-03-05");
  });

  it("returns a string as-is", () => {
    expect(toLocalDateStr("2025-06-30")).toBe("2025-06-30");
  });

  it("returns empty string for invalid input", () => {
    expect(toLocalDateStr(null as any)).toBe("");
    expect(toLocalDateStr(undefined as any)).toBe("");
  });
});

// ── getHumanByIdOrName ──────────────────────────────────────────

describe("getHumanByIdOrName", () => {
  const humans = {
    h1: { id: "h1", name: "Jane", surname: "Doe", fullName: "Jane Doe" },
    h2: { id: "h2", name: "Bob", surname: "Smith", fullName: "Bob Smith" },
  } as any;

  it("finds by key", () => {
    expect(getHumanByIdOrName(humans, "h1")?.id).toBe("h1");
  });

  it("finds by fullName", () => {
    expect(getHumanByIdOrName(humans, "Bob Smith")?.id).toBe("h2");
  });

  it("returns null for missing", () => {
    expect(getHumanByIdOrName(humans, "nobody")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(getHumanByIdOrName(humans, "")).toBeNull();
    expect(getHumanByIdOrName(null as any, "h1")).toBeNull();
  });
});

// ── getDogByIdOrName ────────────────────────────────────────────

describe("getDogByIdOrName", () => {
  const dogs = {
    d1: { id: "d1", name: "Bella" },
    d2: { id: "d2", name: "Max" },
  } as any;

  it("finds by key", () => {
    expect(getDogByIdOrName(dogs, "d1")?.name).toBe("Bella");
  });

  it("finds by name", () => {
    expect(getDogByIdOrName(dogs, "Max")?.id).toBe("d2");
  });

  it("returns null for missing", () => {
    expect(getDogByIdOrName(dogs, "Buddy")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(getDogByIdOrName(dogs, "")).toBeNull();
  });
});

// ── computeBookingPricing ────────────────────────────────────────

describe("computeBookingPricing", () => {
  it("uses PRICING when no custom price", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small" });
    expect(result.basePrice).toBe(42);
    expect(result.subtotal).toBe(42);
    expect(result.amountDue).toBe(42);
  });

  it("prefers customPrice over PRICING", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", customPrice: 55 });
    expect(result.basePrice).toBe(55);
    expect(result.subtotal).toBe(55);
  });

  it("treats null customPrice as unset and falls back to PRICING", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "medium", customPrice: null });
    expect(result.basePrice).toBe(46);
  });

  it("adds addons to subtotal", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", addons: ["Flea Bath"] });
    expect(result.addonsTotal).toBe(10);
    expect(result.subtotal).toBe(52);
    expect(result.amountDue).toBe(52);
  });

  it("subtracts deposit when Deposit Paid", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", addons: ["Flea Bath"], payment: "Deposit Paid", depositAmount: 10 });
    expect(result.subtotal).toBe(52);
    expect(result.depositPaid).toBe(10);
    expect(result.amountDue).toBe(42);
    expect(result.isDepositPaid).toBe(true);
  });

  it("defaults deposit to £10 when Deposit Paid with no amount", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", payment: "Deposit Paid" });
    expect(result.amountDue).toBe(32);
  });

  it("zeroes amountDue when Paid in Full", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", addons: ["Flea Bath"], payment: "Paid in Full" });
    expect(result.subtotal).toBe(52);
    expect(result.amountDue).toBe(0);
    expect(result.isPaidInFull).toBe(true);
  });

  it("clamps amountDue at 0 when deposit exceeds subtotal", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", payment: "Deposit Paid", depositAmount: 100 });
    expect(result.amountDue).toBe(0);
  });

  it("normalizes invalid service+size combo via PRICING fallback", () => {
    const result = computeBookingPricing({ service: "puppy-groom", size: "large" });
    expect(result.basePrice).toBeGreaterThan(0);
  });
});

// ── buildMarkPaidPatch ─────────────────────────────────────────

describe("buildMarkPaidPatch", () => {
  it("defaults the amount from the pricing table", () => {
    const patch = buildMarkPaidPatch({ service: "full-groom", size: "small" }, "card");
    expect(patch).toEqual({ payment: "Paid in Full", paymentMethod: "card", paidAmount: 42 });
  });

  it("prefers the dog's customPrice over the pricing lookup", () => {
    const patch = buildMarkPaidPatch(
      { service: "full-groom", size: "small", customPrice: 55 },
      "cash",
    );
    expect(patch.paidAmount).toBe(55);
    expect(patch.paymentMethod).toBe("cash");
  });

  it("includes add-ons in the defaulted amount", () => {
    const patch = buildMarkPaidPatch(
      { service: "full-groom", size: "small", addons: ["Flea Bath"] },
      "card",
    );
    expect(patch.paidAmount).toBe(52);
  });

  it("records the full subtotal even when a deposit was paid", () => {
    // The deposit stays in deposit_amount; paid_amount is the appointment total.
    const patch = buildMarkPaidPatch(
      { service: "full-groom", size: "small", payment: "Deposit Paid", depositAmount: 10 },
      "card",
    );
    expect(patch.paidAmount).toBe(42);
  });

  it("lets an explicit override beat the computed amount", () => {
    const patch = buildMarkPaidPatch({ service: "full-groom", size: "small" }, "card", 40);
    expect(patch.paidAmount).toBe(40);
  });

  it("keeps a null method as null (still recorded as paid)", () => {
    const patch = buildMarkPaidPatch({ service: "full-groom", size: "small" }, null);
    expect(patch.paymentMethod).toBeNull();
    expect(patch.payment).toBe("Paid in Full");
  });
});

// ── looksLikeUuid ──────────────────────────────────────────────

describe("looksLikeUuid", () => {
  it("matches v4-shaped UUIDs", () => {
    expect(looksLikeUuid("a3f1c2e0-7b89-4d3a-9c1e-1234567890ab")).toBe(true);
  });
  it("rejects names and free text", () => {
    expect(looksLikeUuid("Alfie")).toBe(false);
    expect(looksLikeUuid("Cavalier King Charles Spaniel")).toBe(false);
  });
  it("rejects non-strings", () => {
    expect(looksLikeUuid(123 as unknown as string)).toBe(false);
    expect(looksLikeUuid(null as unknown as string)).toBe(false);
  });
});

// ── resolveBookingDisplay ─────────────────────────────────────

describe("resolveBookingDisplay", () => {
  const dog = {
    id: "d-1",
    name: "Alfie",
    breed: "Cockapoo",
    age: "3",
    size: "small" as const,
    humanId: "Jane Smith",
    _humanId: "h-1",
    alerts: [],
    groomNotes: "",
    customPrice: undefined,
  };
  const human = {
    id: "h-1",
    fullName: "Jane Smith",
    name: "Jane",
    surname: "Smith",
    phone: "07700900001",
    sms: true,
    whatsapp: true,
    email: "",
    fb: "",
    insta: "",
    tiktok: "",
    address: "",
    notes: "",
    historyFlag: "",
    reminderHours: 24,
    reminderChannels: [],
    trustedIds: [],
    trustedContacts: [],
  };
  const booking = {
    id: "bk-1",
    dogName: "Alfie",
    breed: "Boston Terrier",                  // stale value to ensure live join wins
    size: "small" as const,
    service: "full-groom" as const,
    owner: "Old Owner",                       // stale
    status: "Booked" as const,
    slot: "09:30",
    addons: [],
    pickupBy: "",
    payment: "Due at Pick-up",
    confirmed: false,
    dogNameSnapshot: "Old Name",
    breedSnapshot: "Boston Terrier",
    ownerNameSnapshot: "Old Owner",
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    reminderConfirmedAt: null,
    _dogId: "d-1",
    _ownerId: "h-1",
    _pickupById: null,
    _bookingDate: "2026-05-11",
    _groupId: null,
  };

  it("prefers live join over snapshot when dog and human exist", () => {
    const result = resolveBookingDisplay(
      booking,
      { Alfie: dog },
      { "Jane Smith": human },
    );
    expect(result.dogName).toBe("Alfie");
    expect(result.breed).toBe("Cockapoo");
    expect(result.owner).toBe("Jane Smith");
    expect(result.dogMissing).toBe(false);
    expect(result.ownerMissing).toBe(false);
  });

  it("falls back to dogNameSnapshot/breedSnapshot when dog row is missing", () => {
    const result = resolveBookingDisplay(booking, {}, { "Jane Smith": human });
    expect(result.dogName).toBe("Old Name");
    expect(result.breed).toBe("Boston Terrier");
    // dogMissing means "we have no usable name" — the snapshot provides one,
    // so cards should render the name rather than the "Unnamed booking" fallback.
    expect(result.dogMissing).toBe(false);
  });

  it("flags dogMissing=true only when no live row and no snapshot are available", () => {
    const noFallback = { ...booking, dogName: "", dogNameSnapshot: null };
    const result = resolveBookingDisplay(noFallback, {}, { "Jane Smith": human });
    expect(result.dogName).toBe("Unknown");
    expect(result.dogMissing).toBe(true);
  });

  it("renders 'Unknown owner' rather than a UUID-shaped string", () => {
    const result = resolveBookingDisplay(
      { ...booking, owner: "a3f1c2e0-7b89-4d3a-9c1e-1234567890ab", ownerNameSnapshot: null },
      {},
      {},
    );
    expect(result.owner).toBe("Unknown owner");
  });

  it("handles a null booking gracefully", () => {
    const result = resolveBookingDisplay(null, {}, {});
    expect(result.dogName).toBe("Unknown");
    expect(result.owner).toBe("Unknown owner");
    expect(result.dogMissing).toBe(true);
    expect(result.ownerMissing).toBe(true);
  });

  it("editing a dog's breed flows through to the joined display (task 1 acceptance)", () => {
    const before = resolveBookingDisplay(booking, { Alfie: dog }, { "Jane Smith": human });
    expect(before.breed).toBe("Cockapoo");

    const updatedDog = { ...dog, breed: "Cavalier King Charles Spaniel" };
    const after = resolveBookingDisplay(booking, { Alfie: updatedDog }, { "Jane Smith": human });
    expect(after.breed).toBe("Cavalier King Charles Spaniel");
  });

  // Regression: bookings whose dogs/humans hadn't loaded at transform time
  // used to be stamped with the literal string "Unknown" as dogName / owner.
  // Once the cache populated, the live join had to win — otherwise cards
  // rendered "Unknown" indefinitely (and the BookingCardNew "Unknown owner"
  // sentinel check that hides the owner row never matched).
  it("resolves live dog and owner even when the booking carries the legacy 'Unknown' placeholder", () => {
    const legacy = { ...booking, dogName: "Unknown", owner: "Unknown", ownerNameSnapshot: null, breedSnapshot: null };
    const result = resolveBookingDisplay(legacy, { [dog.id]: dog }, { [human.id]: human });
    expect(result.dogName).toBe("Alfie");
    expect(result.breed).toBe("Cockapoo");
    expect(result.owner).toBe("Jane Smith");
    expect(result.dogMissing).toBe(false);
    expect(result.ownerMissing).toBe(false);
  });

  it("returns the 'Unknown owner' sentinel (not the literal 'Unknown') when nothing resolves", () => {
    const legacy = { ...booking, dogName: "Unknown", owner: "Unknown", dogNameSnapshot: null, ownerNameSnapshot: null, breedSnapshot: null, _dogId: "", _ownerId: null };
    const result = resolveBookingDisplay(legacy, {}, {});
    expect(result.dogName).toBe("Unknown");
    expect(result.owner).toBe("Unknown owner");
    expect(result.dogMissing).toBe(true);
    expect(result.ownerMissing).toBe(true);
  });

  // Regression: legacy rows stored the literal "Unknown" in breed_snapshot
  // (and a few dogs.breed values). That string was passing through the
  // selector and showing up next to the owner on the booking card.
  it("treats a literal 'Unknown' breed as missing rather than rendering it on the card", () => {
    const legacyBreedSnapshot = {
      ...booking,
      breedSnapshot: "Unknown",
      breed: "Unknown",
    };
    const result = resolveBookingDisplay(legacyBreedSnapshot, {}, { [human.id]: human });
    expect(result.breed).toBe("");
  });

  it("treats a dog row whose breed column is literally 'Unknown' as missing", () => {
    const dogWithUnknownBreed = { ...dog, breed: "Unknown" };
    // Clear the snapshot fallbacks too so we exercise the dog-row path.
    const bookingWithoutSnapshots = {
      ...booking,
      breedSnapshot: null,
      breed: "",
    };
    const result = resolveBookingDisplay(
      bookingWithoutSnapshots,
      { [dog.id]: dogWithUnknownBreed },
      { [human.id]: human },
    );
    expect(result.breed).toBe("");
  });
});
