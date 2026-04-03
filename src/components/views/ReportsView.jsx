import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase/client.js";
import { BRAND, PRICING, SERVICES } from "../../constants/index.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";

function getEstimatedPrice(serviceId, size) {
  const priceStr = PRICING[serviceId]?.[size] || "£0";
  return parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;
}

export function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [rawBookings, setRawBookings] = useState([]);
  const [timeRange, setTimeRange] = useState("30"); // days

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - parseInt(timeRange, 10));
      const isoDate = dateLimit.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, service, size, status, payment")
        .gte("booking_date", isoDate)
        .order("booking_date", { ascending: false });

      if (error) {
        console.error("Error fetching report data:", error);
      } else {
        setRawBookings(data || []);
      }
      setLoading(false);
    }
    loadStats();
  }, [timeRange]);

  const stats = useMemo(() => {
    let revenue = 0;
    const servicesCount = {};
    const daysCount = {};

    rawBookings.forEach((b) => {
      // Exclude cancelled
      if (b.status === "Cancelled" || b.status === "No Show") return;

      // Revenue
      revenue += getEstimatedPrice(b.service, b.size || "small");

      // Popular Services
      servicesCount[b.service] = (servicesCount[b.service] || 0) + 1;

      // Busiest Days (Day of Week)
      const dayIndex = new Date(b.booking_date).getDay(); // 0=Sun, 1=Mon...
      daysCount[dayIndex] = (daysCount[dayIndex] || 0) + 1;
    });

    // Formatting outputs
    const topServices = Object.entries(servicesCount)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const s = SERVICES.find(x => x.id === id);
        return { name: s ? s.name : id, count };
      });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const topDays = Object.entries(daysCount)
      .sort((a, b) => b[1] - a[1])
      .map(([index, count]) => ({ day: dayNames[index], count }));

    return {
      totalBookings: rawBookings.length,
      revenue,
      topServices,
      topDays
    };
  }, [rawBookings]);

  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: BRAND.text }}>Overview & Analytics</h2>
        <select 
          value={timeRange} 
          onChange={(e) => setTimeRange(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 13, background: BRAND.white }}
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          
          {/* Revenue Card */}
          <div style={{ background: BRAND.white, padding: 24, borderRadius: 16, border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5 }}>Estimated Revenue</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: BRAND.blue, marginTop: 4 }}>£{stats.revenue.toFixed(2)}</div>
            <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Based on base prices</div>
          </div>

          {/* Bookings Card */}
          <div style={{ background: BRAND.white, padding: 24, borderRadius: 16, border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Bookings</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: BRAND.teal, marginTop: 4 }}>{stats.totalBookings}</div>
            <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Completed & Scheduled</div>
          </div>

          {/* Popular Services */}
          <div style={{ background: BRAND.white, padding: 24, borderRadius: 16, border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>Services Breakdown</div>
            {stats.topServices.length === 0 ? <div style={{ fontSize: 13, color: BRAND.textLight }}>No data</div> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {stats.topServices.map(s => (
                <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{s.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.blueDark }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Busiest Days */}
          <div style={{ background: BRAND.white, padding: 24, borderRadius: 16, border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16 }}>Busiest Days</div>
            {stats.topDays.length === 0 ? <div style={{ fontSize: 13, color: BRAND.textLight }}>No data</div> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {stats.topDays.map(d => (
                <div key={d.day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{d.day}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.blueDark }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
