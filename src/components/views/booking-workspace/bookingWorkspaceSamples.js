// The conversation/message fixtures are shared with /inbox — both surfaces now
// render the same workspace, so they must show the same offline data. The
// canonical copy lives in src/data/sample.js, which is also what
// useWhatsAppInbox serves when there is no Supabase client.
import {
  SAMPLE_WHATSAPP_CONVERSATIONS,
  SAMPLE_WHATSAPP_MESSAGES,
} from "../../../data/sample.js";

export const SAMPLE_BOOKING_WORKSPACE_CONVERSATIONS = SAMPLE_WHATSAPP_CONVERSATIONS;
export const SAMPLE_BOOKING_WORKSPACE_MESSAGES = SAMPLE_WHATSAPP_MESSAGES;

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
