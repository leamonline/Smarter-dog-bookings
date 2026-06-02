import { Section } from "./ReportWidgets.jsx";

export function CustomerRanking({ topCusts, uniqueCusts, revPerCust }) {
  const top = topCusts.slice(0, 3);
  return (
    <Section title="Top Customers" accent="#F5C518">
      {top.length === 0 ? (
        <div className="text-body text-ink-muted">No customer data available</div>
      ) : (
        <>
          <div className="flex flex-col">
            {top.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-micro font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-body font-bold text-slate-700 truncate">{c.name}</div>
                    <div className="text-micro text-ink-muted">
                      {c.n} visit{c.n !== 1 ? "s" : ""} · {c.dogs} dog{c.dogs !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <span className="text-body font-black text-brand-teal-text shrink-0 ml-2">
                  {"£"}{c.rev.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex gap-5">
            <div>
              <div className="text-label text-ink-muted">Customers</div>
              <div className="text-title font-black text-slate-700">{uniqueCusts}</div>
            </div>
            <div>
              <div className="text-label text-ink-muted">Avg / customer</div>
              <div className="text-title font-black text-brand-teal-text">{"£"}{revPerCust.toFixed(0)}</div>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
