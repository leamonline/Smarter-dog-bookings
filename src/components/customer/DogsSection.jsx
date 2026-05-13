import { cardAnim } from "./dashboardConstants.js";
import { PawPrint, AlertTriangle, Camera } from "lucide-react";

export function DogsSection({ dogs, onBook }) {
  return (
    <div className="portal-card portal-card--coral" style={cardAnim(0.1)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--coral">
          <PawPrint size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">My dogs</h2>
      </div>

      {dogs.length === 0 ? (
        <div className="portal-polaroid">
          <div className="portal-polaroid-frame" aria-hidden="true">
            <div className="portal-polaroid-photo">
              <Camera size={42} strokeWidth={1.5} />
            </div>
            <span className="portal-polaroid-caption">Add your first pup</span>
          </div>
          <p className="portal-empty-title">No dogs on file just yet</p>
          <p className="portal-empty-body">
            We&apos;ll add your dogs once you&apos;ve been in &mdash; or message the salon to add them now.
          </p>
          <a
            href="https://wa.me/447507731487"
            target="_blank"
            rel="noopener noreferrer"
            className="portal-btn portal-btn--whatsapp"
          >
            <span aria-hidden="true">💬</span>
            Message the salon
          </a>
        </div>
      ) : (
        dogs.map(dog => (
          <div key={dog.id} className="flex justify-between items-center py-3 border-b border-[rgba(45,0,75,0.07)] last:border-b-0">
            <div>
              <div className="text-[15px] font-bold text-brand-purple font-display">{dog.name}</div>
              <div className="text-[13px] font-medium text-slate-500 mt-0.5">
                {dog.breed}{dog.size ? ` · ${dog.size}` : ""}
              </div>
              {dog.groom_notes && (
                <div className="text-xs text-brand-purple bg-white/70 py-1 px-2.5 rounded-md mt-1.5 font-medium">
                  {dog.groom_notes}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {dog.size && (
                <span className={`text-[11px] font-bold py-0.5 px-2.5 rounded-md capitalize ${
                  dog.size === "small" ? "bg-amber-100 text-amber-800" :
                  dog.size === "medium" ? "bg-emerald-100 text-emerald-800" :
                  "bg-pink-100 text-pink-800"
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
