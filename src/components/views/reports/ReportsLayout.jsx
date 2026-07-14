import { NavLink, Outlet, useLocation } from "react-router-dom";

const REPORT_SECTIONS = [
  { to: "/reports/cash-up", label: "Cash-up" },
  { to: "/reports/insights", label: "Insights" },
];

export function ReportsLayout() {
  const location = useLocation();

  return (
    <div className="py-2.5 flex flex-col gap-3 sm:gap-4">
      <h1 className="text-lg sm:text-xl md:text-[22px] font-extrabold m-0 text-slate-800 font-display leading-tight">
        Reports
      </h1>
      <nav aria-label="Report sections" className="inline-flex self-start rounded-control bg-slate-100 p-1">
        {REPORT_SECTIONS.map((section) => (
          <NavLink
            key={section.to}
            to={{ pathname: section.to, search: location.search }}
            className={({ isActive }) => isActive
              ? "min-h-[44px] inline-flex items-center rounded-md bg-white px-4 text-sm font-bold text-brand-purple shadow-sm no-underline"
              : "min-h-[44px] inline-flex items-center rounded-md px-4 text-sm font-semibold text-slate-600 no-underline hover:text-slate-800"}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
