export const SALON_SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

export const SERVICES = [
  { id: "full_groom", name: "Full Groom", icon: "\u2702\uFE0F" },
  { id: "bath_brush", name: "Bath & Brush", icon: "\uD83D\uDEC1" },
  { id: "bath_deshed", name: "Bath & Deshed", icon: "\uD83E\uDDF9" },
  { id: "puppy_cut", name: "Puppy Cut", icon: "\uD83D\uDC3E" },
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

export const LARGE_DOG_SLOTS = {
  "08:30": { seats: 1, canShare: true, needsApproval: false },
  "09:00": { seats: 1, canShare: true, needsApproval: false, conditional: true },
  "12:00": { seats: 2, canShare: false, needsApproval: false },
  "12:30": { seats: 2, canShare: false, needsApproval: false },
  "13:00": { seats: 2, canShare: false, needsApproval: false },
};

export const PRICING = {
  full_groom: { small: "\u00A342+", medium: "\u00A346+", large: "\u00A360+" },
  bath_brush: { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  bath_deshed: { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  puppy_cut: { small: "\u00A338", medium: "\u00A338", large: "N/A" },
};

export const ALERT_OPTIONS = [
  { label: "Bites / Nips", color: "#E8567F" },
  { label: "Reactive to dogs", color: "#E8567F" },
  { label: "Kennel aggressive", color: "#E8567F" },
  { label: "Nervous / Anxious", color: "#D97706" },
  { label: "Fear of dryer", color: "#D97706" },
  { label: "Sensitive paws", color: "#D97706" },
  { label: "Senior (Needs breaks)", color: "#0099BD" },
];
