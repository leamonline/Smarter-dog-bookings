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
