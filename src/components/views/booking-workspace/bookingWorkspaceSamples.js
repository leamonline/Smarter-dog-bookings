const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

export const SAMPLE_BOOKING_WORKSPACE_CONVERSATIONS = [
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
    whatsapp_drafts: [
      { id: "sample-draft-priya", state: "pending", intent: "booking_query", created_at: minutesAgo(125) },
    ],
  },
];

export const SAMPLE_BOOKING_WORKSPACE_MESSAGES = {
  "sample-request-sarah": [
    { id: "s1", direction: "outbound", content: "Hi Sarah, thanks for getting in touch!", sent_at: minutesAgo(180) },
    { id: "s2", direction: "inbound", content: "Any chance of a morning slot this week?", sent_at: minutesAgo(120) },
    { id: "s3", direction: "inbound", content: "Would Wednesday morning work?", sent_at: minutesAgo(18) },
  ],
  "sample-request-david": [
    { id: "d1", direction: "inbound", content: "Do you have any appointment times next week?", sent_at: minutesAgo(72) },
    { id: "d2", direction: "outbound", content: "I can check a couple of mornings for you.", sent_at: minutesAgo(64) },
  ],
  "sample-request-priya": [
    { id: "p1", direction: "inbound", content: "I'd like to book a puppy groom next week.", sent_at: minutesAgo(126) },
  ],
};

export const SAMPLE_BOOKING_WORKSPACE_CONTEXT = {
  "sample-request-sarah": {
    human: {
      id: "h1",
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
    trustedContacts: [],
    loading: false,
    error: null,
  },
  "sample-request-david": {
    human: {
      id: "h2",
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
        alerts: [],
        groomNotes: "Leave ears slightly longer.",
      },
    ],
    lastBooking: null,
    trustedContacts: [],
    loading: false,
    error: null,
  },
  "sample-request-priya": {
    human: null,
    dogs: [],
    lastBooking: null,
    trustedContacts: [],
    loading: false,
    error: null,
  },
};
