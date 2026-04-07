// src/components/views/StatsView.jsx
import { useMemo } from "react";
import { BRAND, PRICING, SERVICES, SALON_SLOTS } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import { getDogByIdOrName, getHumanByIdOrName } from "../../engine/bookingRules.js";
import { toDateStr } from "../../supabase/transforms.js";

function parsePrice(service, size) {
  const priceStr = PRICING[service]?.[size] || "";
  const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

function getWeekDates(refDate) {
  const d = new Date(refDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(dt);
  }
  return dates;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RevenueForDay(bookings) {
  return bookings.reduce((sum, b) => sum + parsePrice(b.service, b.size), 0);
}

export function StatsView() {
  const { dogs, humans, bookingsByDate } = useSalon();

  const today = new Date();
  const todayStr = toDateStr(today);

  // This week's dates (Mon-Sun)
  const thisWeekDates = useMemo(() => getWeekDates(today), [todayStr]);

  // Last week's dates
  const lastWeekDates = useMemo(() => {
    const lastMon = new Date(thisWeekDates[0]);
    lastMon.setDate(lastMon.getDate() - 7);
    return getWeekDates(lastMon);
  }, [thisWeekDates]);

  // Weekly revenue data
  const thisWeekData = useMemo(() => {
    return thisWeekDates.map((date, i) => {
      const dateStr = toDateStr(date);
      const dayBookings = bookingsByDate[dateStr] || [];
      const revenue = RevenueForDay(dayBookings);
      return {
        label: DAY_LABELS[i],
        dateStr,
        revenue,
        count: dayBookings.length,
        isToday: dateStr === todayStr,
      };
    });
  }, [thisWeekDates, bookingsByDate, todayStr]);

  const lastWeekData = useMemo(() => {
    return lastWeekDates.map((date) => {
      const dateStr = toDateStr(date);
      const dayBookings = bookingsByDate[dateStr] || [];
      return RevenueForDay(dayBookings);
    });
  }, [lastWeekDates, bookingsByDate]);

  const thisWeekTotal = thisWeekData.reduce((s, d) => s + d.revenue, 0);
  const lastWeekTotal = lastWeekData.reduce((s, v) => s + v, 0);
  const maxDayRevenue = Math.max(...thisWeekData.map((d) => d.revenue), 1);

  // Monthly total (all loaded data for this month)
  const monthlyTotal = useMemo(() => {
    const month = today.getMonth();
    const year = today.getFullYear();
    let total = 0;
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      if (d.getMonth() === month && d.getFullYear() === year) {
        total += RevenueForDay(dayBookings);
      }
    }
    return total;
  }, [bookingsByDate, todayStr]);

  // --- Operations ---

  // Busiest day of week (from loaded data)
  const busiestDay = useMemo(() => {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
      dayCounts[dayIdx]++;
      dayTotals[dayIdx] += dayBookings.length;
    }
    let bestIdx = 0;
    let bestAvg = 0;
    for (let i = 0; i < 7; i++) {
      const avg = dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : 0;
      if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    }
    const FULL_DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
    return { day: FULL_DAYS[bestIdx], avg: bestAvg.toFixed(1) };
  }, [bookingsByDate]);

  // Service breakdown
  const serviceBreakdown = useMemo(() => {
    const counts = {};
    for (const dayBookings of Object.values(bookingsByDate)) {
      for (const b of dayBookings) {
        counts[b.service] = (counts[b.service] || 0) + 1;
      }
    }
    return SERVICES
      .map((s) => ({ name: s.name, count: counts[s.id] || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [bookingsByDate]);

  // Top 5 customers
  const topCustomers = useMemo(() => {
    const ownerCounts = {};
    for (const dayBookings of Object.values(bookingsByDate)) {
      for (const b of dayBookings) {
        const dog = getDogByIdOrName(dogs, b.dog_id || b.dogName);
        const human = dog?.owner_id
          ? getHumanByIdOrName(humans, dog.owner_id)
          : null;
        const name = human
          ? `${human.first_name || ""} ${human.last_name || ""}`.trim()
          : b.ownerName || b.owner || "Unknown";
        if (name && name !== "Unknown") {
          ownerCounts[name] = (ownerCounts[name] || 0) + 1;
        }
      }
    }
    return Object.entries(ownerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [bookingsByDate, dogs, humans]);

  // Daily averages
  const thisWeekAvg = (thisWeekData.reduce((s, d) => s + d.count, 0) / 7).toFixed(1);
  const lastWeekAvg = useMemo(() => {
    const total = lastWeekDates.reduce((sum, date) => {
      const dateStr = toDateStr(date);
      return sum + (bookingsByDate[dateStr] || []).length;
    }, 0);
    return (total / 7).toFixed(1);
  }, [lastWeekDates, bookingsByDate]);

  // --- Render ---

  const cardStyle = {
    background: BRAND.white,
    border: `1px solid ${BRAND.greyLight}`,
    borderRadius: 14,
    padding: "20px 24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  };

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 800,
    color: BRAND.textLight,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Revenue card */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Revenue</div>

        {/* Hero total */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: BRAND.text }}>
            £{thisWeekTotal}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.textLight }}>
            this week
          </span>
        </div>

        {/* Bar chart */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 120, marginBottom: 16 }}>
          {thisWeekData.map((day) => (
            <div key={day.label} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div
                style={{
                  width: "100%",
                  maxWidth: 40,
                  height: `${Math.max((day.revenue / maxDayRevenue) * 100, 4)}%`,
                  background: day.isToday ? BRAND.teal : BRAND.blue,
                  borderRadius: "6px 6px 0 0",
                  transition: "height 0.3s",
                  minHeight: 4,
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.text, marginTop: 6 }}>
                {day.label}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.textLight }}>
                £{day.revenue}
              </div>
            </div>
          ))}
        </div>

        {/* Comparisons */}
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>Last week: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>£{lastWeekTotal}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>This month: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>£{monthlyTotal}</span>
          </div>
        </div>
      </div>

      {/* Operations card */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Operations</div>

        {/* Busiest day */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>
            {busiestDay.day} are your busiest day
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>
            avg {busiestDay.avg} bookings per {busiestDay.day.replace(/s$/, "").toLowerCase()}
          </div>
        </div>

        {/* Service breakdown */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, marginBottom: 8 }}>
            Services
          </div>
          {serviceBreakdown.map((svc) => {
            const pct = serviceBreakdown[0]?.count > 0
              ? (svc.count / serviceBreakdown[0].count) * 100
              : 0;
            return (
              <div key={svc.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, width: 110, flexShrink: 0 }}>
                  {svc.name}
                </span>
                <div style={{ flex: 1, height: 8, background: "#F1F3F5", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: BRAND.blue, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.text, width: 30, textAlign: "right" }}>
                  {svc.count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Top customers */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, marginBottom: 8 }}>
            Top Customers
          </div>
          {topCustomers.map((c, i) => (
            <div key={c.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>
                {i + 1}. {c.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.blue }}>
                {c.count} booking{c.count !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
          {topCustomers.length === 0 && (
            <div style={{ fontSize: 12, color: BRAND.textLight }}>No booking data yet</div>
          )}
        </div>

        {/* Daily averages */}
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>This week: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>{thisWeekAvg}/day</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>Last week: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>{lastWeekAvg}/day</span>
          </div>
        </div>
      </div>
    </div>
  );
}
