import { useState, useMemo } from "react";
import { BRAND } from "../../constants/index.js";
import { toDateStr } from "../../supabase/transforms.js";

export function MonthTab({ currentDateObj, bookingsByDate, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);

  const monthLabel = currentDateObj.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const today = toDateStr(new Date());

  // Build calendar grid cells
  const cells = useMemo(() => {
    const year = currentDateObj.getFullYear();
    const month = currentDateObj.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Mon=0 … Sun=6 alignment
    const startPad = (firstDay.getDay() + 6) % 7; // 0=Mon offset
    const daysInMonth = lastDay.getDate();

    const result = [];

    // Leading empty cells
    for (let i = 0; i < startPad; i++) {
      result.push(null);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toDateStr(new Date(year, month, d));
      result.push(dateStr);
    }

    return result;
  }, [currentDateObj]);

  const wrapperStyle = {
    flex: "1.1",
    minWidth: 80,
    borderRadius: "10px 10px 0 0",
    background: BRAND.white,
    textAlign: "center",
    border: `1.5px solid ${isActive ? BRAND.blue : BRAND.greyLight}`,
    borderBottom: "none",
    userSelect: "none",
    paddingBottom: 6,
    cursor: "pointer",
    transition: "all 0.2s",
    opacity: isActive ? 1 : hovered ? 0.9 : 0.7,
    transform: isActive ? "translateY(-3px)" : hovered ? "translateY(-2px)" : "translateY(0)",
    zIndex: isActive ? 2 : 1,
    boxShadow: isActive
      ? "0 -4px 14px rgba(0,184,224,0.12)"
      : "0 -2px 8px rgba(0,0,0,0.04)",
  };

  return (
    <div
      style={wrapperStyle}
      onClick={onClick}
      onMouseEnter={() => { if (!isActive) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Blue strip */}
      <div style={{
        background: BRAND.blueDark,
        padding: "3px 4px",
        fontSize: 8,
        fontWeight: 800,
        color: BRAND.white,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        borderRadius: "8px 8px 0 0",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {monthLabel}
      </div>

      {/* Mini calendar grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 0,
        padding: "3px 4px",
        marginTop: 2,
      }}>
        {cells.map((dateStr, i) => {
          if (!dateStr) {
            return <div key={`empty-${i}`} style={{ width: 5, height: 5, margin: "1px auto" }} />;
          }

          const isToday = dateStr === today;
          const hasBookings = !!(bookingsByDate[dateStr]?.length);

          let dotColour;
          if (isToday) {
            dotColour = "#E8567F";
          } else if (hasBookings) {
            dotColour = "#00B8E0";
          } else {
            dotColour = "#E5E7EB";
          }

          return (
            <div
              key={dateStr}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: dotColour,
                margin: "1px auto",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
