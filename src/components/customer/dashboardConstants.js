export const SERVICE_LABELS = {
  "full-groom": "Full Groom",
  "bath-and-brush": "Bath & Brush",
  "bath-and-deshed": "Bath & Deshed",
  "puppy-groom": "Puppy Groom",
  "nail-trim": "Nail Trim",
};

export const SERVICE_ICONS = {
  "full-groom": "\u2702\uFE0F",
  "bath-and-brush": "\uD83D\uDEC1",
  "bath-and-deshed": "\uD83E\uDDF9",
  "puppy-groom": "\uD83D\uDC3E",
  "nail-trim": "\u2702\uFE0F",
};

export const STATUS_STYLES = {
  "No-show":          { background: "#F1F5F9", color: "#475569" },
  "Checked in":       { background: "#E6F5F2", color: "#1E6B5C" },
  "Drying":           { background: "#E8E0FF", color: "#5B3D99" },
  "On the Table":     { background: "#F0E0FF", color: "#7B3DC9" },
  "Finished":         { background: "#E6F5F2", color: "#1E6B5C" },
  "Ready for pick-up":{ background: "#F0F0F5", color: "#666" },
  "Cancelled":        { background: "#FFE8E8", color: "#CC2020" },
};

export const POLAROID_COLORS = ["#00C2FF", "#E8506A", "#FFCC00", "#2A6F6B", "#7AB8A8", "#2D004B"];
export const POLAROID_ROTATIONS = [-5, 3, -2, 4, -3, 2];

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

export const cardAnim = (delay) => ({ animation: `cardSlideUp 0.4s ease-out ${delay}s both` });
