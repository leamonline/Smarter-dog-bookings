import { cardAnim } from "./dashboardConstants.js";
import { Users } from "lucide-react";

export function TrustedHumansSection({ trustedHumans }) {
  return (
    <div className="portal-card portal-card--buttercup" style={cardAnim(0.15)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--buttercup">
          <Users size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">Trusted humans</h2>
      </div>

      {trustedHumans.length === 0 ? (
        <div className="text-center py-2">
          <p className="portal-empty-body">
            People you trust to drop off or pick up your dog. None added yet &mdash; message us to set this up.
          </p>
        </div>
      ) : (
        trustedHumans.map(th => (
          <div key={th.id} className="py-2.5 border-b border-[rgba(45,0,75,0.07)] last:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-bold text-brand-purple font-display">{th.name} {th.surname}</div>
              {th.relationship ? (
                <div className="text-xs text-slate-500 italic shrink-0">{th.relationship}</div>
              ) : null}
            </div>
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

      <div className="mt-3 flex flex-wrap gap-2 justify-center">
        <a
          href="https://wa.me/447507731487"
          target="_blank"
          rel="noopener noreferrer"
          className="portal-btn portal-btn--whatsapp"
        >
          <span aria-hidden="true">💬</span>
          WhatsApp us
        </a>
        <a
          href="sms:07507731487"
          className="portal-btn portal-btn--phone"
        >
          <span aria-hidden="true">📱</span>
          Text 07507 731487
        </a>
      </div>
    </div>
  );
}
