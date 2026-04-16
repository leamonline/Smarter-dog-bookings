import { useState } from "react";
import { useReportsData } from "../../hooks/useReportsData.ts";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { Kpi, PERIODS } from "./reports/ReportWidgets.jsx";
import { RevenueTrend } from "./reports/RevenueTrend.jsx";
import { ServiceMix } from "./reports/ServiceMix.jsx";
import { SizeSplit } from "./reports/SizeSplit.jsx";
import { ScheduleCharts } from "./reports/ScheduleCharts.jsx";
import { CustomerRanking } from "./reports/CustomerRanking.jsx";
import { BookingHealth } from "./reports/BookingHealth.jsx";
import { WeeklySnapshot } from "./reports/WeeklySnapshot.jsx";

export function ReportsView() {
  const [days, setDays] = useState(30);
  const { loading, stats, chartLabels, insights } = useReportsData(days);

  return (
    <div className="py-2.5 flex flex-col gap-4">
      {/* Weekly Snapshot */}
      <WeeklySnapshot />

      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-[22px] font-extrabold m-0 text-slate-800 font-display">Overview & Analytics</h2>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {PERIODS.map((p) => (
            <button
              key={p.v}
              onClick={() => setDays(p.v)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-bold border-none cursor-pointer transition-all font-[inherit] ${
                days === p.v
                  ? "bg-white text-slate-800 shadow-sm"
                  : "bg-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : stats.curN === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="text-lg font-bold text-slate-400 mb-1">No bookings in this period</div>
          <div className="text-sm text-slate-400">Try selecting a longer time range.</div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Revenue"
              value={`\u00A3${stats.curRev.toFixed(0)}`}
              sub={`vs \u00A3${stats.prevRev.toFixed(0)} prev period`}
              cur={stats.curRev}
              prev={stats.prevRev}
              color="#2D8B7A"
            />
            <Kpi
              label="Bookings"
              value={stats.curN}
              sub={`${stats.uniqueCusts} customer${stats.uniqueCusts !== 1 ? "s" : ""}`}
              cur={stats.curN}
              prev={stats.prevN}
              color="#0EA5E9"
            />
            <Kpi
              label="Avg per Dog"
              value={`\u00A3${stats.avgPer.toFixed(0)}`}
              sub="estimated from base prices"
              cur={stats.avgPer}
              prev={stats.prevAvgPer}
              color="#7C3AED"
            />
            <Kpi
              label="Seat Fill Rate"
              value={`${stats.util.toFixed(0)}%`}
              sub={`across ${stats.openDays} open day${stats.openDays !== 1 ? "s" : ""}`}
              color="#E8567F"
            />
          </div>

          {/* Revenue Trend */}
          <RevenueTrend
            days={days}
            chart={stats.chart}
            maxChartRev={stats.maxChartRev}
            chartLabels={chartLabels}
            insight={insights.capacity}
          />

          {/* Service Mix + Size Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ServiceMix svcs={stats.svcs} maxSvcRev={stats.maxSvcRev} insight={insights.service} />
            <SizeSplit sizes={stats.sizes} insight={insights.size} />
          </div>

          {/* Schedule: Days + Slots */}
          <ScheduleCharts
            dow={stats.dow}
            maxDowN={stats.maxDowN}
            busiestDay={stats.busiestDay}
            slots={stats.slots}
            maxSlotN={stats.maxSlotN}
            busiestSlot={stats.busiestSlot}
            dayInsight={insights.day}
          />

          {/* Customers + Booking Health */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CustomerRanking
              topCusts={stats.topCusts}
              uniqueCusts={stats.uniqueCusts}
              revPerCust={stats.revPerCust}
            />
            <BookingHealth
              statusAcc={stats.statusAcc}
              totalPast={stats.totalPast}
              noShowN={stats.noShowN}
              noShowRate={stats.noShowRate}
              prevNoShowRate={stats.prevNoShowRate}
              insight={insights.health}
            />
          </div>
        </>
      )}
    </div>
  );
}
