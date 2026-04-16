import { cardAnim } from "./dashboardConstants.js";
import { Users, Phone } from "lucide-react";

export function TrustedHumansSection({ trustedHumans }) {
  return (
    <div className="portal-card" style={cardAnim(0.15)}>
      <div className="portal-card-header">
        <Users size={18} className="portal-card-icon" aria-hidden="true" />
        <h2 className="portal-card-title">Trusted Humans</h2>
      </div>
      {trustedHumans.length === 0 ? (
        <div className="text-center py-2">
          <p className="text-[13px] text-slate-500 italic m-0">None listed</p>
        </div>
      ) : (
        trustedHumans.map(th => (
          <div key={th.id} className="py-2.5 border-b border-slate-100 last:border-b-0">
            <div className="text-sm font-semibold text-brand-purple font-display">{th.name} {th.surname}</div>
            {th.phone ? (
              <a
                href={`tel:${th.phone.replace(/\s/g, "")}`}
                className="text-xs text-slate-500 font-medium no-underline hover:underline"
              >
                {th.phone}
              </a>
            ) : null}
          </div>
        ))
      )}
      <div className="mt-3 py-2.5 px-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
        <span className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-slate-500">
          <Phone size={14} aria-hidden="true" />
          <a href="https://wa.me/447507731487" target="_blank" rel="noopener noreferrer" className="text-brand-teal hover:underline">Message the salon</a> to add a trusted human
        </span>
      </div>
    </div>
  );
}
