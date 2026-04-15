import { cardAnim } from "./dashboardConstants.js";
import { PawPrint, AlertTriangle } from "lucide-react";

export function DogsSection({ dogs }) {
  return (
    <div className="portal-card portal-card--teal" style={cardAnim(0.1)}>
      <div className="portal-card-header">
        <PawPrint size={18} className="portal-card-icon" aria-hidden="true" />
        <h2 className="portal-card-title">Dogs</h2>
      </div>
      {dogs.length === 0 ? (
        <div className="text-center py-4">
          <PawPrint size={32} className="text-slate-300 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-brand-cyan-dark m-0 mb-1">No dogs on file</p>
          <p className="text-[13px] text-slate-500 m-0">
            <a href="tel:+441onal" className="text-brand-teal font-semibold hover:underline">Contact the salon</a> to add your dogs
          </p>
        </div>
      ) : (
        dogs.map(dog => (
          <div key={dog.id} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-b-0">
            <div>
              <div className="text-[15px] font-semibold text-brand-cyan-dark font-[Montserrat]">{dog.name}</div>
              <div className="text-[13px] font-medium text-slate-500 mt-0.5">
                {dog.breed}{dog.size ? ` \u00B7 ${dog.size}` : ""}
              </div>
              {dog.groom_notes && (
                <div className="text-xs text-brand-cyan-dark-light bg-cyan-50 py-1 px-2.5 rounded-md mt-1.5 font-medium">
                  {dog.groom_notes}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {dog.size && (
                <span className={`text-[11px] font-bold py-0.5 px-2.5 rounded-md capitalize ${
                  dog.size === "small" ? "bg-amber-50 text-amber-700" :
                  dog.size === "medium" ? "bg-emerald-50 text-emerald-700" :
                  "bg-pink-50 text-pink-700"
                }`}>{dog.size}</span>
              )}
              {dog.alerts && dog.alerts.length > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-brand-coral">
                  <AlertTriangle size={12} aria-hidden="true" />
                  {dog.alerts.length} alert{dog.alerts.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
