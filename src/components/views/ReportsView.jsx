import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase/client.js";
import { PRICING, SERVICES } from "../../constants/index.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";

function getEstimatedPrice(serviceId, size) {
  const priceStr = PRICING[serviceId]?.[size] || "\u00A30";
  return parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;
}

export function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [rawBookings, setRawBookings] = useState([]);
  const [timeRange, setTimeRange] = useState("30");

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
      if (b.status === "Cancelled" || b.status === "No Show") return;

      revenue += getEstimatedPrice(b.service, b.size || "small");

      servicesCount[b.service] = (servicesCount[b.service] || 0) + 1;

      const dayIndex = new Date(b.booking_date).getDay();
      daysCount[dayIndex] = (daysCount[dayIndex] || 0) + 1;
    });

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
      topDays,
    };
  }, [rawBookings]);

  return (
    <div className="py-2.5">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[22px] font-extrabold m-0 text-slate-800">Overview & Analytics</h2>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] bg-white"
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Revenue Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide">Estimated Revenue</div>
            <div className="text-4xl font-extrabold text-brand-blue mt-1">\u00A3{stats.revenue.toFixed(2)}</div>
            <div className="text-[13px] text-slate-500 mt-1">Based on base prices</div>
          </div>

          {/* Bookings Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide">Total Bookings</div>
            <div className="text-4xl font-extrabold text-brand-teal mt-1">{stats.totalBookings}</div>
            <div className="text-[13px] text-slate-500 mt-1">Completed & Scheduled</div>
          </div>

          {/* Popular Services */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-4">Services Breakdown</div>
            {stats.topServices.length === 0 ? <div className="text-[13px] text-slate-500">No data</div> : null}
            <div className="flex flex-col gap-3">
              {stats.topServices.map(s => (
                <div key={s.name} className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                  <span className="text-sm font-extrabold text-[#1E6B5C]">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Busiest Days */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-4">Busiest Days</div>
            {stats.topDays.length === 0 ? <div className="text-[13px] text-slate-500">No data</div> : null}
            <div className="flex flex-col gap-3">
              {stats.topDays.map(d => (
                <div key={d.day} className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-800">{d.day}</span>
                  <span className="text-sm font-extrabold text-[#1E6B5C]">{d.count}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
