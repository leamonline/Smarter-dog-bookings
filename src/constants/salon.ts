export const SALON_SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

/** Maximum dogs that can be groomed in a single slot (the 2-2-1 rule = 5 seats). */
export const MAX_DOGS_PER_SLOT = 5;

export const SERVICES = [
  { id: "full-groom", name: "Full Groom" },
  { id: "bath-and-brush", name: "Bath & Brush" },
  { id: "bath-and-deshed", name: "Bath & Deshed" },
  { id: "puppy-groom", name: "Puppy Groom" },
];

export const ALL_DAYS = [
  { key: "mon", label: "Mon", full: "Monday", defaultOpen: true },
  { key: "tue", label: "Tue", full: "Tuesday", defaultOpen: true },
  { key: "wed", label: "Wed", full: "Wednesday", defaultOpen: true },
  { key: "thu", label: "Thu", full: "Thursday", defaultOpen: false },
  { key: "fri", label: "Fri", full: "Friday", defaultOpen: false },
  { key: "sat", label: "Sat", full: "Saturday", defaultOpen: false },
  { key: "sun", label: "Sun", full: "Sunday", defaultOpen: false },
];

// Large dog slot rules:
// - 08:30, 09:00: Start-of-day exception — large dog takes 1 seat, can share with small/medium
// - 12:00: Can share with small/medium (1 seat), BUT triggers early close on 13:00
// - 12:30, 13:00: Full takeover — large dog fills both seats, no sharing
// - Back-to-back large dogs (2-seat each) only permitted at 12:30 + 13:00
export const LARGE_DOG_SLOTS = {
  "08:30": { seats: 1, canShare: true, needsApproval: false },
  "09:00": { seats: 1, canShare: true, needsApproval: false, conditional: true },
  "12:00": { seats: 1, canShare: true, needsApproval: false },
  "12:30": { seats: 2, canShare: false, needsApproval: false },
  "13:00": { seats: 2, canShare: false, needsApproval: false },
};

export const PRICING = {
  "full-groom": { small: "\u00A342+", medium: "\u00A346+", large: "\u00A360+" },
  "bath-and-brush": { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  "bath-and-deshed": { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  "puppy-groom": { small: "\u00A338", medium: "\u00A338", large: "N/A" },
};

export const BOOKING_STATUSES = [
  { id: "No-show", label: "Booked", color: "#475569", bg: "#F1F5F9" },
  { id: "Checked in", label: "Checked in", color: "#16A34A", bg: "#DCFCE7" },
  { id: "Ready for pick-up", label: "Finished", color: "#7C3AED", bg: "#EDE9FE" },
];

export const ALERT_OPTIONS = [
  { label: "Bites / Nips", color: "#E8567F" },
  { label: "Reactive to dogs", color: "#E8567F" },
  { label: "Kennel aggressive", color: "#E8567F" },
  { label: "Nervous / Anxious", color: "#D97706" },
  { label: "Fear of dryer", color: "#D97706" },
  { label: "Sensitive paws", color: "#D97706" },
  { label: "Senior (Needs breaks)", color: "#0099BD" },
];
