import { serviceLabel } from "../inbox/helpers.js";

const BOOKING_INTENTS = new Set([
  "booking_query",
  "booking_propose",
  "booking_confirm",
  "confirm_time",
]);

const REQUEST_TEXT = /\b(book|booking|appointment|availability|available|slot|time)\b/i;
const CHANGE_TEXT = /\b(cancel\w*|reschedul\w*|move my|change my|existing booking)\b/i;
const KNOWN_SIZES = new Set(["small", "medium", "large"]);

function pendingCreateAction(conversation) {
  const direct = conversation?.pending_booking_action;
  if (direct?.state === "pending" && direct.action === "create") return direct;
  if (!Array.isArray(conversation?.whatsapp_booking_actions)) return null;
  return (
    conversation.whatsapp_booking_actions.find(
      (action) => action?.state === "pending" && action?.action === "create",
    ) ?? null
  );
}

function pendingBookingDraft(conversation) {
  const direct = conversation?.pending_draft;
  if (direct?.state === "pending" && BOOKING_INTENTS.has(direct.intent)) return direct;
  if (!Array.isArray(conversation?.whatsapp_drafts)) return null;
  return (
    conversation.whatsapp_drafts.find(
      (draft) => draft?.state === "pending" && BOOKING_INTENTS.has(draft?.intent),
    ) ?? null
  );
}

export function mergedRequestState(conversation) {
  return {
    ...(conversation?.lead_payload && typeof conversation.lead_payload === "object"
      ? conversation.lead_payload
      : {}),
    ...(conversation?.agent_state && typeof conversation.agent_state === "object"
      ? conversation.agent_state
      : {}),
  };
}

/**
 * Strictly derives the read-only queue from existing WhatsApp metadata.
 * Cancellation/reschedule conversations stay in Inbox even if stale agent
 * state still contains service preferences from an earlier booking turn.
 */
export function isActiveAppointmentRequest(conversation) {
  if (!conversation || conversation.closed_at) return false;
  if ((conversation.channel || "whatsapp") !== "whatsapp") return false;
  if (pendingCreateAction(conversation)) return true;
  if (pendingBookingDraft(conversation)) return true;

  const text = String(
    conversation.last_customer_text || conversation.last_message_text || "",
  );
  if (CHANGE_TEXT.test(text)) return false;

  const state = mergedRequestState(conversation);
  const hasStructuredBookingNeed = Boolean(
    state.service || state.preferredDay || state.preferredTime,
  );
  return hasStructuredBookingNeed && REQUEST_TEXT.test(text);
}

function dogsForConversation(conversation) {
  const dogs = conversation?.humans?.dogs;
  return Array.isArray(dogs) ? dogs : [];
}

function dogForRequest(conversation, action, state) {
  const dogs = dogsForConversation(conversation);
  const actionDogId = action?.payload?.dog_id;
  if (actionDogId) {
    const matched = dogs.find((dog) => dog.id === actionDogId);
    if (matched) return matched;
  }
  if (state.dogName) {
    const matched = dogs.find(
      (dog) => String(dog.name).toLowerCase() === String(state.dogName).toLowerCase(),
    );
    if (matched) return matched;
    return { name: state.dogName, size: state.dogSize, breed: state.breed };
  }
  return dogs.length === 1 ? dogs[0] : null;
}

function isWaitingForCustomer(conversation) {
  if (!conversation?.last_outbound_at) return false;
  if (!conversation.last_inbound_at) return true;
  return (
    new Date(conversation.last_outbound_at).getTime() >=
    new Date(conversation.last_inbound_at).getTime()
  );
}

export function requestStatus(conversation, dogName, service, size) {
  if (!conversation?.human_id || !dogName || !service || !size) return "Needs details";
  if (pendingCreateAction(conversation)) return "Ready to confirm";
  if (isWaitingForCustomer(conversation)) return "Waiting for customer";
  return "Needs reply";
}

export function formatRequestAge(iso, nowMs = Date.now()) {
  if (!iso) return "";
  const ageMinutes = Math.max(
    0,
    Math.floor((nowMs - new Date(iso).getTime()) / 60_000),
  );
  if (ageMinutes < 60) return `${ageMinutes} min`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function buildBookingRequest(conversation, nowMs = Date.now()) {
  const state = mergedRequestState(conversation);
  const action = pendingCreateAction(conversation);
  const dog = dogForRequest(conversation, action, state);
  const service = action?.payload?.service || state.service || null;
  const recordedDog = dogsForConversation(conversation).find(
    (candidate) => candidate.id === dog?.id,
  );
  // Conversation and proposal payloads are customer/AI-derived. Capacity is
  // safety-critical, so only the canonical size on an existing dog record is
  // allowed to drive the diary engine.
  const size = KNOWN_SIZES.has(recordedDog?.size) ? recordedDog.size : null;
  const dogName = dog?.name || null;

  return {
    id: conversation.id,
    conversation,
    customerName:
      [conversation?.humans?.name, conversation?.humans?.surname]
        .filter(Boolean)
        .join(" ") ||
      [state.customerName, state.customerSurname].filter(Boolean).join(" ") ||
      conversation.phone_e164 ||
      "Unknown customer",
    dogName,
    dog,
    size,
    service,
    serviceLabel: service ? serviceLabel(service) : "Service needed",
    preferredDay: state.preferredDay || null,
    preferredTime: state.preferredTime || null,
    latestMessage:
      conversation.last_customer_text || conversation.last_message_text || "",
    ageLabel: formatRequestAge(
      conversation.last_inbound_at || conversation.last_message_at,
      nowMs,
    ),
    status: requestStatus(conversation, dogName, service, size),
  };
}

const STATUS_ORDER = new Map([
  ["Ready to confirm", 0],
  ["Needs reply", 1],
  ["Needs details", 2],
  ["Waiting for customer", 3],
]);

export function buildActiveRequestQueue(conversations, nowMs = Date.now()) {
  return (conversations || [])
    .filter(isActiveAppointmentRequest)
    .map((conversation) => buildBookingRequest(conversation, nowMs))
    .sort((a, b) => {
      const statusDelta =
        (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99);
      if (statusDelta !== 0) return statusDelta;
      return String(a.conversation.last_inbound_at || "").localeCompare(
        String(b.conversation.last_inbound_at || ""),
      );
    });
}

export function slotChoiceKey(choice) {
  return `${choice.dateStr}|${choice.slot}`;
}

export function toggleDraftSlot(choices, choice, limit = 3) {
  const key = slotChoiceKey(choice);
  const existing = choices.findIndex((item) => slotChoiceKey(item) === key);
  if (existing >= 0) {
    return {
      choices: choices.filter((_, index) => index !== existing),
      atLimit: false,
    };
  }
  if (choices.length >= limit) {
    return { choices, atLimit: true };
  }
  return {
    choices: [...choices, choice].sort((a, b) => slotChoiceKey(a).localeCompare(slotChoiceKey(b))),
    atLimit: false,
  };
}
