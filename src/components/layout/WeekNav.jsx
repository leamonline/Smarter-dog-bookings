import { BRAND, ALL_DAYS } from "../../constants/index.js";

function WeekArrowBtn({ direction, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 28, display: "flex", alignItems: "center", justifyContent: "center",
      background: BRAND.blue, border: "none", borderRadius: 8, cursor: "pointer",
      transition: "all 0.15s", flexShrink: 0,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={BRAND.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M10 3l-5 5 5 5" /> : <path d="M6 3l5 5-5 5" />}
      </svg>
    </button>
  );
}

export function WeekNav({ selectedDay, onSelectDay, bookingsByDay, dayOpenState, onPrevWeek, onNextWeek }) {
  return (
    <div style={{ display: "flex", gap: 4, background: BRAND.offWhite, borderRadius: 12, padding: 4 }}>
      <WeekArrowBtn direction="left" onClick={onPrevWeek} />
      {ALL_DAYS.map((day, i) => {
        const isSelected = selectedDay === i;
        const isOpen = dayOpenState[day.key];
        const count = (bookingsByDay[day.key] || []).length;

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
              flex: 1,
              padding: "6px 4px 8px",
              borderRadius: 8,
              border: "none",
              background: bg,
              color: labelColor,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            <span>{day.label}</span>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              color: countColor,
              lineHeight: 1,
            }}>
              {isOpen ? count : "\u2014"}
            </span>
          </button>
        );
      })}
      <WeekArrowBtn direction="right" onClick={onNextWeek} />
    </div>
  );
}
