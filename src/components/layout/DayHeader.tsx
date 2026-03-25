import { BRAND } from "../../constants/index.ts";
import { CalendarDate } from "./CalendarDate.tsx";
import type { DateInfo } from "../../types.ts";

interface Props {
  day: string;
  date: DateInfo;
  dogCount: number;
  maxDogs: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onCalendarClick: () => void;
}

export function DayHeader({ day, date, dogCount, maxDogs, isOpen, onToggleOpen, onCalendarClick }: Props) {
  const progress = dogCount / maxDogs;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px",
      background: isOpen ? `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})` : `linear-gradient(135deg, #9CA3AF, #6B7280)`,
      borderRadius: "14px 14px 0 0", color: BRAND.white,
    }}>
      <CalendarDate dayName={day} dayNum={date.dayNum} monthShort={date.monthShort} year={date.year} onClick={onCalendarClick} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {isOpen ? (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{dogCount}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>appointments</div>
            <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.3)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, progress * 100)}%`, height: "100%", background: progress > 0.85 ? BRAND.coral : BRAND.yellow, borderRadius: 2, transition: "width 0.3s ease" }} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.9 }}>Closed</div>
        )}
        <button onClick={onToggleOpen} title={isOpen ? "Close this day" : "Open this day"} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          transition: "transform 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
          <svg width={isOpen ? 78 : 90} height={68} viewBox={isOpen ? "0 0 78 68" : "0 0 90 68"}>
            <circle cx={isOpen ? 32 : 38} cy="4" r="3.5" fill="rgba(255,255,255,0.7)" />
            <line x1={isOpen ? 32 : 38} y1="7" x2={isOpen ? 14 : 14} y2="28" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            <line x1={isOpen ? 32 : 38} y1="7" x2={isOpen ? 66 : 78} y2="22" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            <g transform={`rotate(-5, ${isOpen ? 39 : 45}, 40)`}>
              <rect x={isOpen ? 5 : 5} y="22" width={isOpen ? 68 : 80} height="36" rx="4" fill={isOpen ? BRAND.openGreen : BRAND.closedRed} />
              <rect x={isOpen ? 8 : 8} y="25" width={isOpen ? 62 : 74} height="30" rx="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <text x={isOpen ? 39 : 45} y="46" textAnchor="middle" fill="white" fontSize="16" fontWeight="800" fontFamily="inherit" letterSpacing="2">{isOpen ? "OPEN" : "CLOSED"}</text>
            </g>
          </svg>
        </button>
      </div>
    </div>
  );
}
