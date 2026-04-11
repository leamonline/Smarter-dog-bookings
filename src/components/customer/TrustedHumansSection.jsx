import { cardAnim } from "./dashboardConstants.js";

export function TrustedHumansSection({ trustedHumans }) {
  return (
    <div className="pink-card" style={cardAnim(0.19)}>
      <div className="pink-card-header">
        <span className="pink-card-icon" aria-hidden="true">{"\uD83E\uDD1D"}</span>
        <h2 className="pink-card-title">Trusted Humans</h2>
      </div>
      {trustedHumans.length === 0 ? (
        <div className="portal-empty">
          <p className="portal-empty-text" style={{ fontStyle: "italic" }}>None listed</p>
        </div>
      ) : (
        trustedHumans.map(th => (
          <div key={th.id} className="portal-trusted-item">
            <div className="portal-trusted-name">{th.name} {th.surname}</div>
            <div className="portal-trusted-phone">{th.phone}</div>
          </div>
        ))
      )}
      <div className="portal-trusted-cta">
        {"\uD83D\uDCDE"} Contact the salon to add a trusted human
      </div>
    </div>
  );
}
