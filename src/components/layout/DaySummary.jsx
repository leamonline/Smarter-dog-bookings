import { useMemo } from "react";
import { BRAND, BOOKING_STATUSES, PRICING } from "../../constants/index.js";

export function DaySummary({ bookings }) {
  const stats = useMemo(() => {
    const counts = {};
    for (const s of BOOKING_STATUSES) counts[s.id] = 0;
    let revenue = 0;

    for (const b of bookings) {
      const status = b.status || "Not Arrived";
      if (counts[status] !== undefined) counts[status]++;

      // Estimate revenue from pricing
      const priceStr = PRICING[b.service]?.[b.size] || "0";
      const price = parseInt(priceStr.replace(/[^\d]/g, "")) || 0;
      revenue += price;
      if ((b.addons || []).includes("Flea Bath")) revenue += 10;
    }

    return { counts, revenue, total: bookings.length };
  }, [bookings]);

  if (stats.total === 0) return null;

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 16px",
      background: BRAND.offWhite, borderBottom: `1px solid ${BRAND.greyLight}`,
      alignItems: "center",
    }}>
      {BOOKING_STATUSES.map(s => {
        const count = stats.counts[s.id];
        if (count === 0) return null;
        return (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 4,
            background: s.bg, border: `1px solid ${s.color}20`,
            borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: s.color,
          }}>
            <span>{count}</span>
            <span style={{ fontWeight: 500 }}>{s.label}</span>
          </div>
        );
      })}
      <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: BRAND.openGreen }}>
        Est. {"\u00A3"}{stats.revenue}
      </div>
    </div>
  );
}
