export const SERVICE_LABELS = {
  "full-groom": "Full Groom",
  "bath-and-brush": "Bath & Brush",
  "bath-and-deshed": "Bath & De-shed",
  "puppy-groom": "Puppy Groom",
  "nail-trim": "Nail Trim",
};

// Icon names resolved to Lucide components in each component file
export const SERVICE_ICON_NAMES = {
  "full-groom": "Scissors",
  "bath-and-brush": "Droplets",
  "bath-and-deshed": "Wind",
  "puppy-groom": "PawPrint",
  "nail-trim": "Scissors",
};

export const STATUS_STYLES = {
  "Booked":            { background: "var(--sd-buttercup-tint)", color: "#8A6300",            borderColor: "rgba(254, 204, 19, 0.45)" },
  "Checked in":        { background: "var(--sd-mint-tint)",      color: "#0F6B3A",            borderColor: "rgba(0, 194, 71, 0.35)"  },
  "Drying":            { background: "var(--sd-sky-tint)",       color: "var(--sd-cyan-dark)", borderColor: "rgba(0, 122, 171, 0.30)" },
  "On the Table":      { background: "var(--sd-sky-tint)",       color: "var(--sd-cyan-dark)", borderColor: "rgba(0, 122, 171, 0.30)" },
  "Ready for pick-up": { background: "var(--sd-mint-tint)",      color: "#0F6B3A",            borderColor: "rgba(0, 194, 71, 0.35)"  },
  "Completed":         { background: "rgba(45, 0, 75, 0.06)",    color: "var(--sd-navy)",     borderColor: "rgba(45, 0, 75, 0.18)"   },
  "Cancelled":         { background: "var(--sd-coral-tint)",     color: "#B83A4F",            borderColor: "rgba(231, 84, 108, 0.35)" },
};

export function formatSlot(slot) {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export const cardAnim = (delay) => ({ animation: `cardSlideUp 0.3s ease-out ${delay}s both` });
