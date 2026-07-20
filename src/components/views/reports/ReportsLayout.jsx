import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PageHeader } from "../../ui/index.js";

const REPORT_SECTIONS = [
  { to: "/reports/cash-up", label: "Cash-up" },
  { to: "/reports/insights", label: "Insights" },
];

export function ReportsLayout() {
  const location = useLocation();

  return (
    <div className="flex flex-col">
      <PageHeader title="Reports">
        <nav aria-label="Report sections" className="grid w-full grid-cols-2 gap-3">
          {REPORT_SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={{ pathname: section.to, search: location.search }}
              className={({ isActive }) => isActive
                ? "inline-flex h-14 items-center justify-center rounded-control bg-brand-purple px-5 text-base font-extrabold text-white shadow-sm no-underline"
                : "inline-flex h-14 items-center justify-center rounded-control border border-slate-200 bg-slate-100 px-5 text-base font-bold text-brand-purple no-underline transition-colors hover:border-brand-purple/30 hover:bg-brand-purple/5"}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
      </PageHeader>
      <Outlet />
    </div>
  );
}
