import { BRAND, ALL_DAYS } from "../../constants/index.js";

export function WeekNav({ selectedDay, onSelectDay, bookingsByDate, dates, dayOpenState }) {
  return (
    <div style={{ display: "flex", gap: 4, background: BRAND.offWhite, borderRadius: 12, padding: 4 }}>
      {ALL_DAYS.map((day, i) => {
        const isSelected = selectedDay === i;
        const dateStr = dates[i]?.dateStr;
        const isOpen = dateStr ? (dayOpenState[dateStr] ?? false) : false;
        const count = dateStr ? (bookingsByDate[dateStr] || []).length : 0;

        let bg, labelColor, countColor;
        if (isSelected) {
          bg = isOpen ? BRAND.blue : "#9CA3AF";
          labelColor = BRAND.white;
          countColor = "rgba(255,255,255,0.85)";
        } else {
          bg = "transparent";
          labelColor = isOpen ? BRAND.text : BRAND.textLight;
          countColor = isOpen
            ? (count > 0 ? BRAND.blue : BRAND.textLight)
            : BRAND.closedRed;
        }

        return (
          <button
            key={day.key}
            onClick={() => onSelectDay(i)}
            style={{
              flex: 1, padding: "6px 4px 8px", borderRadius: 8, border: "none",
              background: bg, color: labelColor, fontWeight: 700, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            }}
          >
            <span>{day.label}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: countColor, lineHeight: 1 }}>
              {isOpen ? `${count} Dog${count !== 1 ? "s" : ""}` : "\u2014"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
