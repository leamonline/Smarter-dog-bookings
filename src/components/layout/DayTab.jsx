import { useState } from "react";
import { BRAND } from "../../constants/index.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);

  const dayName = DAY_NAMES[dateObj.getDay()];
  const dateNum = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString("en-GB", { month: "long" });

  const stripBg = isOpen ? BRAND.openGreen : BRAND.closedRed;

  const dateNumColour = isOpen ? BRAND.text : "#9CA3AF";
  const monthColour = isOpen ? BRAND.text : "#9CA3AF";

  let dogCountColour;
  if (!isOpen) {
    dogCountColour = BRAND.closedRed;
  } else if (isActive) {
    dogCountColour = BRAND.blueDark;
  } else {
    dogCountColour = BRAND.blue;
  }

  let dogCountText;
  if (!isOpen) {
    dogCountText = "Closed";
  } else if (dogCount === 1) {
    dogCountText = "1 dog";
  } else {
    dogCountText = `${dogCount} dogs`;
  }

  const wrapperStyle = {
    flex: 1,
    minWidth: 72,
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
      {/* Coloured strip */}
      <div style={{
        background: stripBg,
        padding: "3px 0",
        fontSize: 8,
        fontWeight: 800,
        color: BRAND.white,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        borderRadius: "8px 8px 0 0",
      }}>
        {dayName}
      </div>

      {/* Date number */}
      <div style={{
        fontSize: 24,
        fontWeight: 900,
        color: dateNumColour,
        marginTop: 2,
        lineHeight: 1,
      }}>
        {dateNum}
      </div>

      {/* Month name */}
      <div style={{
        fontSize: 13,
        fontWeight: 800,
        color: monthColour,
        marginTop: 1,
        lineHeight: 1,
      }}>
        {monthName}
      </div>

      {/* Dog count */}
      <div style={{
        fontSize: 9,
        fontWeight: 800,
        marginTop: 3,
        color: dogCountColour,
        lineHeight: 1,
      }}>
        {dogCountText}
      </div>
    </div>
  );
}
