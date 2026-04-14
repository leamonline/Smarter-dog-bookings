import { Section } from "./ReportWidgets.jsx";

export function CustomerRanking({ topCusts, uniqueCusts, revPerCust }) {
  return (
    <Section title="Top Customers by Revenue" accent="#F5C518">
      {topCusts.length === 0 ? (
        <div className="text-[13px] text-slate-400">No customer data available</div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {topCusts.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-[11px] font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-slate-700 truncate">{c.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {c.n} visit{c.n !== 1 ? "s" : ""} · {c.dogs} dog{c.dogs !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <span className="text-[14px] font-black text-[#2D8B7A] shrink-0 ml-2">
                  {"\u00A3"}{c.rev.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex gap-5">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Customers</div>
              <div className="text-[16px] font-black text-slate-700">{uniqueCusts}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Avg per Customer</div>
              <div className="text-[16px] font-black text-[#2D8B7A]">{"\u00A3"}{revPerCust.toFixed(0)}</div>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
