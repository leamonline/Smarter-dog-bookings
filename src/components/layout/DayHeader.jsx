import { BRAND } from "../../constants/index.js";
import { CalendarDate } from "./CalendarDate.jsx";

const VIEW_BTN_COLOURS = { day: "#F5C518", week: "#2D8B7A", month: "#E8567F" };

function ViewBtn({ mode, label, calendarMode, setCalendarMode }) {
  const active = calendarMode === mode;
  const colour = VIEW_BTN_COLOURS[mode];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setCalendarMode(mode); }}
      style={{
        padding: "4px 8px", borderRadius: 6, border: "none",
        background: active ? BRAND.white : "rgba(255,255,255,0.15)",
        color: active ? colour : "rgba(255,255,255,0.85)",
        fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >{label}</button>
  );
}

function WeekArrow({ direction, onClick, colour = BRAND.blue }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
      width: 28, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
      background: BRAND.white, border: "none", borderRadius: 8, cursor: "pointer",
      flexShrink: 0, transition: "all 0.15s",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M10 3l-5 5 5 5" /> : <path d="M6 3l5 5-5 5" />}
      </svg>
    </button>
  );
}

function OpenSign({ isOpen, onClick }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={isOpen ? "Close this day" : "Open this day"} style={{
      background: "none", border: "none", cursor: "pointer", padding: 0,
      flexShrink: 0, transition: "transform 0.2s", width: 134, display: "flex", justifyContent: "center",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
      <svg width={134} height={62} viewBox="0 0 134 62">
        <circle cx="67" cy="5" r="3" fill="rgba(255,255,255,0.7)" />
        <line x1="67" y1="8" x2="47" y2="22" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
        <line x1="67" y1="8" x2="87" y2="18" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
        <g transform="rotate(-4, 67, 38)">
          <rect x="3" y="18" width="128" height="36" rx="4" fill={isOpen ? BRAND.openGreen : BRAND.closedRed} />
          <text x="67" y="42" textAnchor="middle" fill="white" fontSize="18" fontWeight="800" fontFamily="inherit" letterSpacing="2">{isOpen ? "OPEN" : "CLOSED"}</text>
        </g>
      </svg>
    </button>
  );
}

export function DayHeader({ day, date, dogCount, maxDogs, isOpen, onToggleOpen, onCalendarClick, calendarMode, setCalendarMode, onPrev, onNext, arrowColour }) {
  // Convert full day name to short: Monday → MON, Tuesday → TUE, etc.
  const shortDay = day ? day.substring(0, 3).toUpperCase() : "";
  const chevronColour = arrowColour || BRAND.blue;

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "14px 16px",
      background: isOpen ? `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})` : `linear-gradient(135deg, #9CA3AF, #6B7280)`,
      borderRadius: "14px 14px 0 0", color: BRAND.white,
    }}>
      {/* Prev arrow — far left */}
      {onPrev && <WeekArrow direction="left" onClick={onPrev} colour={chevronColour} />}

      {/* Centre group */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <CalendarDate dayName={shortDay} dayNum={date.dayNum} monthShort={date.monthShort} year={date.year} onClick={onCalendarClick} />

        <OpenSign isOpen={isOpen} onClick={onToggleOpen} />

        {/* View toggle buttons — stacked next to the other elements */}
        {setCalendarMode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <ViewBtn mode="day" label="Day View" calendarMode={calendarMode} setCalendarMode={setCalendarMode} />
            <ViewBtn mode="week" label="Week View" calendarMode={calendarMode} setCalendarMode={setCalendarMode} />
            <ViewBtn mode="month" label="Month View" calendarMode={calendarMode} setCalendarMode={setCalendarMode} />
          </div>
        )}
      </div>

      {/* Next arrow — far right */}
      {onNext && <WeekArrow direction="right" onClick={onNext} colour={chevronColour} />}
    </div>
  );
}
