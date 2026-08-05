// ============================================================
// src/components/views/booking-workspace/bookingComposerModel.js
//
// Pure derivation for the inbox Booking pane's two staff actions. No React,
// no Supabase — everything here is a function of its arguments, so the rules
// that matter (who can be selected, what fits, what the customer is told) are
// unit-testable without rendering a pane or touching the network.
//
// The capacity engine remains PREFLIGHT ONLY. Nothing here decides whether a
// booking is legal; the three BEFORE INSERT gates in Postgres do.
// See docs/booking-pane-actions-spec.md.
// ============================================================

import { DOG_SIZE, PRICING, SERVICES } from "../../../constants/index";
import { getMaxSeatsForSlot } from "../../../engine/capacity";

/** Offers are capped at three times — enough choice without reading as a list. */
export const MAX_OFFER_SLOTS = 3;

const FALLBACK_SERVICE = "full-groom";

const KNOWN_SIZES = new Set([DOG_SIZE.SMALL, DOG_SIZE.MEDIUM, DOG_SIZE.LARGE]);

/**
 * A dog can only join an availability calculation when its own record carries
 * an authoritative size. Conversation- and AI-derived sizes are deliberately
 * ignored: guessing here would let the pane offer a slot the salon cannot
 * actually staff.
 */
export function isDogSelectable(dog) {
  return KNOWN_SIZES.has(dog?.size);
}

/** Services actually offered at this dog's size (PRICING null = not offered). */
export function availableServicesFor(dog) {
  if (!isDogSelectable(dog)) return [];
  return SERVICES.filter((service) => {
    const bySize = PRICING[service.id];
    return bySize ? bySize[dog.size] != null : false;
  });
}

/**
 * Most recent service for this dog, falling back to Full Groom — including
 * when the remembered service is no longer offered at the dog's current size
 * (a puppy grown into a large dog can't have another puppy groom).
 */
export function defaultServiceFor(dog, lastServiceByDogId) {
  const last = lastServiceByDogId?.[dog?.id];
  const offered = availableServicesFor(dog);
  if (last && offered.some((service) => service.id === last)) return last;
  return FALLBACK_SERVICE;
}

/**
 * What staff need to judge a slot at a glance: how many seats are free, and
 * who is already in it. Seat totals come from the same 2-2-1 helper the
 * engine uses, so a slot next to two doubles correctly reports fewer seats.
 */
export function seatOccupancy(slot, dayBookings, activeSlots) {
  const inSlot = (dayBookings || []).filter((booking) => booking.slot === slot);

  const seatsMap = {};
  for (const booking of dayBookings || []) {
    seatsMap[booking.slot] = (seatsMap[booking.slot] || 0) + 1;
  }

  const index = activeSlots.indexOf(slot);
  const total = index === -1 ? 0 : getMaxSeatsForSlot(index, seatsMap, activeSlots);

  // A large dog takes the whole slot regardless of the seat arithmetic.
  const takenOver = inSlot.some((booking) => booking.size === DOG_SIZE.LARGE);
  const booked = inSlot.length;
  const free = takenOver ? 0 : Math.max(0, total - booked);

  return {
    booked,
    total,
    free,
    dogs: inSlot.map((booking) => ({
      name: booking.dogName || "Unknown dog",
      breed: booking.breed || null,
      size: booking.size || null,
    })),
  };
}

export function offerSlotKey(choice) {
  return `${choice.dateStr}__${choice.slot}`;
}

/**
 * Add or remove an offered time, capped at MAX_OFFER_SLOTS. Returns the
 * original array unchanged when the cap blocks an addition, so callers can
 * detect "nothing happened" by identity.
 */
export function toggleOfferSlot(choices, choice) {
  const key = offerSlotKey(choice);
  const existing = choices.findIndex((entry) => offerSlotKey(entry) === key);
  if (existing !== -1) return choices.filter((_, index) => index !== existing);
  if (choices.length >= MAX_OFFER_SLOTS) return choices;
  return [...choices, choice];
}

function parseDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function longDate(dateStr) {
  return parseDate(dateStr).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "Alfie", "Alfie and Bella", "Alfie, Bella and Rex". */
export function joinNames(names) {
  const list = names.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function firstName(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "";
}

/**
 * The draft offer message. Composed here rather than in the component so the
 * wording is testable and stays in the salon's warm house voice.
 *
 * This is only ever INSERTED INTO THE COMPOSER — never sent. The existing send
 * path keeps ownership of the WhatsApp 24-hour window and template rules.
 */
export function buildOfferText({ customerName, dogs, choices }) {
  if (!dogs?.length || !choices?.length) return "";

  const greetingName = firstName(customerName);
  const dogNames = joinNames(dogs.map((dog) => dog.name));
  // Without a name, open on the sentence itself rather than a dangling "Hi,".
  const opener = greetingName
    ? `Hi ${greetingName}, we have availability for ${dogNames} on:`
    : `We have availability for ${dogNames} on:`;

  const ordered = [...choices].sort((a, b) =>
    a.dateStr === b.dateStr
      ? a.slot.localeCompare(b.slot)
      : a.dateStr.localeCompare(b.dateStr),
  );

  const lines = ordered.map(
    (choice) => `• ${longDate(choice.dateStr)} at ${choice.slot}`,
  );

  return [opener, ...lines, "Let us know which works best."].join("\n");
}
