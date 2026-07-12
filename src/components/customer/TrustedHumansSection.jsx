import { cardAnim } from "./dashboardConstants.js";
import { Users } from "lucide-react";

const AVATAR_PALETTE = ["sky", "buttercup", "mint", "coral"];
function avatarTintFor(id) {
  if (!id) return AVATAR_PALETTE[1];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function TrustedHumansSection({ trustedHumans }) {
  return (
    <div className="portal-card portal-card--buttercup" style={cardAnim(0.15)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--buttercup">
          <Users size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">Trusted humans</h2>
      </div>

      <div className="flex-1">
        {trustedHumans.map(th => {
          const initial = (th.name || "?").trim().charAt(0).toUpperCase();
          const tint = avatarTintFor(th.id);
          const fullName = `${th.name || ""} ${th.surname || ""}`.trim();
          return (
            <div key={th.id} className="portal-entity-row">
              <span className={`portal-avatar portal-avatar--${tint}`} aria-hidden="true">
                {initial}
              </span>
              <div className="portal-entity-row-body">
                <p className="portal-entity-row-name">{fullName}</p>
                {th.relationship && (
                  <p className="portal-entity-row-meta">{th.relationship}</p>
                )}
                {th.phone && (
                  <a
                    href={`tel:${th.phone.replace(/\s/g, "")}`}
                    className="portal-entity-row-meta hover:underline"
                    style={{ display: "block" }}
                  >
                    {th.phone}
                  </a>
                )}
              </div>
            </div>
          );
        })}

        <p
          className="portal-text-help"
          style={{ margin: trustedHumans.length > 0 ? "12px 0 0" : 0 }}
        >
          Adding a trusted human online is temporarily unavailable.
        </p>
      </div>
    </div>
  );
}
