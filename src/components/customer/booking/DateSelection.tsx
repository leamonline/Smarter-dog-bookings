import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND } from "../../../constants/index.js";
import { getDefaultOpenForDate } from "../../../engine/utils.js";

interface DateSelectionProps {
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const DAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateSelection({ selectedDate, onSelect, onNext, onBack }: DateSelectionProps) {
  const [daySettings, setDaySettings] = useState<Record<string, { is_open: boolean }>>({});
  const [loading, setLoading] = useState(true);

  // Build the 28-day range starting from tomorrow
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const days: Date[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(tomorrow);
    d.setDate(tomorrow.getDate() + i);
    days.push(d);
  }

  const rangeStart = toDateStr(days[0]);
  const rangeEnd = toDateStr(days[days.length - 1]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!supabase) return;
        const { data } = await supabase
          .from("day_settings")
          .select("date, is_open")
          .gte("date", rangeStart)
          .lte("date", rangeEnd);
        if (cancelled) return;
        const map: Record<string, { is_open: boolean }> = {};
        (data || []).forEach((row: { date: string; is_open: boolean }) => {
          map[row.date] = { is_open: row.is_open };
        });
        setDaySettings(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd]);

  const isOpen = (date: Date): boolean => {
    const str = toDateStr(date);
    if (daySettings[str] !== undefined) return daySettings[str].is_open;
    return getDefaultOpenForDate(date);
  };

  // Figure out the first day-of-week offset so we can pad the grid
  const firstDay = days[0];
  const jsDay = firstDay.getDay(); // 0=Sun...6=Sat
  const offset = jsDay === 0 ? 6 : jsDay - 1; // Mon-first offset

  const gridCells: (Date | null)[] = [
    ...Array(offset).fill(null),
    ...days,
  ];

  // Pad the end to complete the last row
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, color: BRAND.textLight, fontSize: 14 }}>
        Pick a date for your visit (next 28 days).
      </p>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
        {DAY_HEADERS.map((h, i) => (
          <div key={i} style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight, padding: "4px 0" }}>
            {h}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <p style={{ color: BRAND.textLight, fontSize: 14 }}>Loading availability…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {gridCells.map((d, i) => {
            if (!d) {
              return <div key={`empty-${i}`} />;
            }
            const dateStr = toDateStr(d);
            const open = isOpen(d);
            const selected = selectedDate === dateStr;

            return (
              <button
                key={dateStr}
                disabled={!open}
                onClick={() => open && onSelect(dateStr)}
                style={{
                  padding: "8px 4px",
                  borderRadius: 6,
                  border: selected ? `2px solid ${BRAND.teal}` : `1px solid ${open ? BRAND.greyLight : "transparent"}`,
                  background: selected ? BRAND.tealLight : open ? BRAND.white : BRAND.offWhite,
                  color: open ? BRAND.text : BRAND.greyLight,
                  fontWeight: selected ? 700 : 400,
                  fontSize: 13,
                  cursor: open ? "pointer" : "default",
                  textAlign: "center",
                }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          onClick={onBack}
          style={{
            padding: "11px 20px",
            borderRadius: 8,
            border: `1px solid ${BRAND.greyLight}`,
            background: BRAND.white,
            color: BRAND.grey,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!selectedDate}
          style={{
            flex: 1,
            padding: "11px 20px",
            borderRadius: 8,
            border: "none",
            background: selectedDate ? BRAND.teal : BRAND.greyLight,
            color: selectedDate ? BRAND.white : BRAND.grey,
            fontWeight: 700,
            fontSize: 15,
            cursor: selectedDate ? "pointer" : "not-allowed",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
