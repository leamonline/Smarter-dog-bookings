import { BOOKING_STATUS } from "../constants/salon";

export const SAMPLE_HUMANS = {
  "Sarah Jones": { id: "h1", name: "Sarah", surname: "Jones", phone: "07700 900111", sms: true, whatsapp: true, email: "sarah@example.com", fb: "", insta: "@sarahj", tiktok: "", address: "123 Main St", notes: "Prefers texts", trustedIds: ["Dave Smith"], historyFlag: "1 No-show (Oct 2023)" },
  "Dave Smith": { id: "h2", name: "Dave", surname: "Smith", phone: "07700 900112", sms: true, whatsapp: false, email: "dave@example.com", fb: "davesmith", insta: "", tiktok: "", address: "456 Side St", notes: "", trustedIds: ["Sarah Jones"], historyFlag: "" },
  "Emma Wilson": { id: "h3", name: "Emma", surname: "Wilson", phone: "07700 900113", sms: false, whatsapp: true, email: "emma@example.com", fb: "", insta: "", tiktok: "", address: "789 Park Rd", notes: "", trustedIds: [] },
  "Tom Baker": { id: "h4", name: "Tom", surname: "Baker", phone: "07700 900114", sms: true, whatsapp: true, email: "tom@example.com", fb: "", insta: "", tiktok: "", address: "101 High St", notes: "", trustedIds: [] },
  "Lisa Brown": { id: "h5", name: "Lisa", surname: "Brown", phone: "07700 900115", sms: true, whatsapp: false, email: "lisa@example.com", fb: "", insta: "", tiktok: "", address: "202 Elm St", notes: "", trustedIds: [] },
  "Jenny Taylor": { id: "h6", name: "Jenny", surname: "Taylor", phone: "07700 900116", sms: false, whatsapp: false, email: "jenny@example.com", fb: "", insta: "", tiktok: "", address: "303 Oak St", notes: "", trustedIds: [] },
  "Mark Johnson": { id: "h7", name: "Mark", surname: "Johnson", phone: "07700 900117", sms: true, whatsapp: true, email: "mark@example.com", fb: "", insta: "", tiktok: "", address: "404 Pine St", notes: "", trustedIds: [] },
};

export const SAMPLE_DOGS = {
  "Bella": { id: "d1", name: "Bella", breed: "Cockapoo", age: "3 yrs", size: "medium", humanId: "Sarah Jones", alerts: ["Allergic to oatmeal shampoo"], groomNotes: "Teddy bear cut, short on ears." },
  "Max": { id: "d2", name: "Max", breed: "Shih Tzu", age: "5 yrs", size: "small", humanId: "Dave Smith", alerts: ["Bites / Nips"], groomNotes: "Leave tail long." },
  "Luna": { id: "d3", name: "Luna", breed: "Cavapoo", age: "2 yrs", size: "small", humanId: "Emma Wilson", alerts: [], groomNotes: "" },
  "Charlie": { id: "d4", name: "Charlie", breed: "Bichon Frise", age: "4 yrs", size: "small", humanId: "Tom Baker", alerts: [], groomNotes: "" },
  "Daisy": { id: "d5", name: "Daisy", breed: "Poodle", age: "1 yr", size: "medium", humanId: "Lisa Brown" },
  "Milo": { id: "d6", name: "Milo", breed: "Maltese", age: "6 yrs", size: "small", humanId: "Jenny Taylor" },
  "Rex": { id: "d7", name: "Rex", breed: "Labrador", age: "7 yrs", size: "large", humanId: "Mark Johnson" },
};

export const SAMPLE_BOOKINGS_BY_DAY = {
  mon: [
    { id: 1, slot: "08:30", dogName: "Bella", breed: "Cockapoo", size: "small", service: "full-groom", owner: "Sarah Jones", status: BOOKING_STATUS.CHECKED_IN, addons: [], pickupBy: "Dave Smith", payment: "Deposit Paid", _dogId: "d1", _ownerId: "h1" },
    { id: 2, slot: "08:30", dogName: "Max", breed: "Shih Tzu", size: "medium", service: "bath-and-brush", owner: "Dave Smith", status: BOOKING_STATUS.BOOKED, addons: [], pickupBy: "Dave Smith", payment: "Due at Pick-up" },
    { id: 3, slot: "09:00", dogName: "Luna", breed: "Cavapoo", size: "small", service: "full-groom", owner: "Emma Wilson", status: BOOKING_STATUS.READY_FOR_PICKUP, payment: "Paid in Full" },
    { id: 4, slot: "09:00", dogName: "Charlie", breed: "Bichon Frise", size: "medium", service: "bath-and-deshed", owner: "Tom Baker", status: BOOKING_STATUS.IN_BATH, payment: "Deposit Paid" },
    { id: 5, slot: "10:00", dogName: "Daisy", breed: "Poodle", size: "small", service: "full-groom", owner: "Lisa Brown", status: BOOKING_STATUS.COMPLETED, payment: "Paid in Full" },
    // Deliberately bare (no status/payment) — exercises the board's recoverable
    // unknown-status warning without making the whole demo day unusable.
    { id: 6, slot: "10:00", dogName: "Milo", breed: "Maltese", size: "small", service: "bath-and-brush", owner: "Jenny Taylor" },
    { id: 7, slot: "12:00", dogName: "Rex", breed: "Labrador", size: "large", service: "bath-and-deshed", owner: "Mark Johnson", status: BOOKING_STATUS.BOOKED },
  ],
  tue: [
    { id: 101, slot: "08:30", dogName: "Coco", breed: "Pomeranian", size: "small", service: "full-groom", owner: "Amy Clarke", status: BOOKING_STATUS.BOOKED },
    { id: 102, slot: "09:00", dogName: "Teddy", breed: "Goldendoodle", size: "medium", service: "bath-and-brush", owner: "Rik Patel", status: BOOKING_STATUS.BOOKED },
    // Reminder sent, no reply yet — exercises "Needs confirmation" and the
    // staff Confirm action on the Daily Brief.
    { id: 103, slot: "09:30", dogName: "Poppy", breed: "Cocker Spaniel", size: "medium", service: "full-groom", owner: "Helen Wright", status: BOOKING_STATUS.BOOKED, reminderState: "sent", confirmationChannel: "whatsapp" },
  ],
  wed: [
    // A cancelled booking on an open day — exercises the rule that cancelled
    // rows free their seat and must not render in the staff slot grid.
    { id: 8, slot: "09:00", dogName: "Luna", breed: "Cavapoo", size: "small", service: "full-groom", owner: "Emma Wilson", status: BOOKING_STATUS.CANCELLED, addons: [], pickupBy: "Emma Wilson", payment: "Refunded" },
  ],
  thu: [], fri: [], sat: [], sun: [],
};

// ── WhatsApp inbox ────────────────────────────────────────────
// Offline fixtures for the Inbox workspace. useWhatsAppInbox serves these
// whenever there is no Supabase client (VITE_FORCE_OFFLINE=1, or missing creds
// in dev), so /inbox and /booking-workspace both render populated at every
// breakpoint without touching a real customer conversation.
//
// Timestamps are relative so the thread always looks current. Between them the
// three conversations cover each row status the list can show — pending draft,
// failed send and needs-review — plus a failed outbound bubble and a pending AI
// draft in the thread.

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

export const SAMPLE_WHATSAPP_CONVERSATIONS = [
  {
    id: "sample-request-sarah",
    phone_e164: "+447700900123",
    channel: "whatsapp",
    human_id: "h1",
    humans: {
      name: "Sarah",
      surname: "Jones",
      dogs: [{ id: "sample-luna", name: "Luna", breed: "Cockapoo", size: "small" }],
    },
    agent_state: {
      dogName: "Luna",
      dogSize: "small",
      breed: "Cockapoo",
      dogAge: "4",
      service: "full-groom",
      preferredDay: "weekday",
      preferredTime: "morning",
    },
    last_customer_text: "Would Wednesday morning work?",
    last_message_text: "Would Wednesday morning work?",
    last_message_direction: "inbound",
    last_inbound_at: minutesAgo(18),
    last_message_at: minutesAgo(18),
    last_outbound_at: minutesAgo(180),
    unread_count: 1,
    closed_at: null,
    has_pending_draft: true,
    whatsapp_drafts: [
      { id: "sample-draft-sarah", state: "pending", intent: "booking_query", created_at: minutesAgo(17) },
    ],
  },
  {
    id: "sample-request-david",
    phone_e164: "+447700900124",
    channel: "whatsapp",
    human_id: "h2",
    humans: {
      name: "David",
      surname: "Miller",
      dogs: [{ id: "sample-milo", name: "Milo", breed: "Maltese", size: "small" }],
    },
    agent_state: {
      dogName: "Milo",
      dogSize: "small",
      service: "bath-and-brush",
      preferredDay: "Monday or Tuesday",
    },
    last_customer_text: "Do you have any appointment times next week?",
    last_message_text: "I can check a couple of mornings for you.",
    last_message_direction: "outbound",
    last_inbound_at: minutesAgo(72),
    last_outbound_at: minutesAgo(64),
    last_message_at: minutesAgo(64),
    unread_count: 0,
    closed_at: null,
    has_failed_message: true,
    latest_failed_message: { error_message: "Meta rejected the send (re-engagement window closed)." },
    whatsapp_drafts: [],
  },
  {
    id: "sample-request-priya",
    phone_e164: "+447700900125",
    channel: "whatsapp",
    human_id: null,
    humans: null,
    lead_status: "collecting",
    lead_payload: {
      customerName: "Priya",
      customerSurname: "Taylor",
      dogName: "Teddy",
      service: "puppy-groom",
      preferredDay: "next week",
    },
    last_customer_text: "I'd like to book a puppy groom next week.",
    last_message_text: "I'd like to book a puppy groom next week.",
    last_message_direction: "inbound",
    last_inbound_at: minutesAgo(126),
    last_message_at: minutesAgo(126),
    last_outbound_at: null,
    unread_count: 1,
    closed_at: null,
    needs_human_review: true,
    whatsapp_drafts: [
      {
        id: "sample-draft-priya",
        state: "pending",
        intent: "booking_query",
        risk_level: "high",
        handoff_required: true,
        created_at: minutesAgo(125),
      },
    ],
  },
];

const sampleMessage = (id, direction, content, minutes, overrides = {}) => ({
  id,
  direction,
  content,
  sent_at: minutesAgo(minutes),
  channel: "whatsapp",
  status: direction === "inbound" ? "received" : "delivered",
  ...overrides,
});

export const SAMPLE_WHATSAPP_MESSAGES = {
  "sample-request-sarah": [
    sampleMessage("s1", "outbound", "Hi Sarah, thanks for getting in touch!", 180),
    sampleMessage("s2", "inbound", "Any chance of a morning slot this week?", 120),
    sampleMessage("s3", "outbound", "Of course — let me have a look at the diary for you.", 100),
    sampleMessage("s4", "inbound", "Would Wednesday morning work?", 18),
  ],
  "sample-request-david": [
    sampleMessage("d1", "inbound", "Do you have any appointment times next week?", 72),
    sampleMessage("d2", "outbound", "I can check a couple of mornings for you.", 64),
    // Exercises the failed-send bubble and its confirmed Retry.
    sampleMessage("d3", "outbound", "Would Monday at 9:00am suit?", 40, {
      status: "failed",
      error_message: "Meta rejected the send (re-engagement window closed).",
    }),
  ],
  "sample-request-priya": [
    sampleMessage("p1", "inbound", "I'd like to book a puppy groom next week.", 126),
  ],
};

// One pending AI draft so the thread's DraftPanel renders offline. Keyed by
// conversation; the others have no draft awaiting approval.
export const SAMPLE_WHATSAPP_DRAFTS = {
  "sample-request-sarah": {
    id: "sample-draft-sarah",
    state: "pending",
    intent: "booking_query",
    proposed_text:
      "Hiya Sarah! Wednesday morning works nicely for Luna — I've got 9:30am or 11:00am free. Which would suit you best?",
    confidence: 0.86,
    risk_level: "low",
    handoff_required: false,
    auto_send_eligible: false,
    model: "claude-sonnet-4-5",
    created_at: minutesAgo(17),
  },
};

export const SAMPLE_WHATSAPP_DOG_NAMES = {
  "sample-request-sarah": [{ id: "sample-luna", name: "Luna" }],
  "sample-request-david": [{ id: "sample-milo", name: "Milo" }],
  "sample-request-priya": [],
};

// Customer context for the workspace's Customer section, keyed by human_id so
// useCustomerContext can serve it offline. Priya has no human record on
// purpose — it exercises the "no customer match yet" state.
export const SAMPLE_CUSTOMER_CONTEXT = {
  h1: {
    human: {
      id: "h1",
      name: "Sarah",
      surname: "Jones",
      fullName: "Sarah Jones",
      phone: "07700 900123",
      email: "sarah.jones@example.com",
      notes: "Prefers morning appointments.",
    },
    dogs: [
      {
        id: "sample-luna",
        name: "Luna",
        breed: "Cockapoo",
        age: "4",
        size: "small",
        alerts: [],
        groomNotes: "Not scared of the dryer. Prefers light scissoring on face.",
      },
    ],
    lastBooking: null,
    trustedContacts: [{ id: "h2", fullName: "David Miller", relationship: "Partner" }],
    summary: "Sarah Jones · Luna (Cockapoo, small) · prefers morning appointments.",
  },
  h2: {
    human: {
      id: "h2",
      name: "David",
      surname: "Miller",
      fullName: "David Miller",
      phone: "07700 900124",
      email: "david@example.com",
      notes: "",
    },
    dogs: [
      {
        id: "sample-milo",
        name: "Milo",
        breed: "Maltese",
        age: "6",
        size: "small",
        alerts: ["Nervous with clippers"],
        groomNotes: "Leave ears slightly longer.",
      },
    ],
    lastBooking: null,
    trustedContacts: [],
    summary: "David Miller · Milo (Maltese, small).",
  },
};
