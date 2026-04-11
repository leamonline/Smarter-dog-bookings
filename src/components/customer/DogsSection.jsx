import { cardAnim } from "./dashboardConstants.js";

export function DogsSection({ dogs }) {
  return (
    <div className="pink-card" style={cardAnim(0.12)}>
      <div className="pink-card-header">
        <span className="pink-card-icon" aria-hidden="true">{"\uD83D\uDC15"}</span>
        <h2 className="pink-card-title">Dogs</h2>
      </div>
      {dogs.length === 0 ? (
        <div className="portal-empty">
          <div className="portal-empty-icon">{"\uD83D\uDC3E"}</div>
          <p className="portal-empty-title">No dogs on file</p>
          <p className="portal-empty-text">Contact the salon to add your dogs</p>
        </div>
      ) : (
        dogs.map(dog => (
          <div key={dog.id} className="portal-dog-item">
            <div>
              <div className="portal-dog-name">{dog.name}</div>
              <div className="portal-dog-meta">
                {dog.breed}{dog.size ? ` \u00B7 ${dog.size}` : ""}
              </div>
              {dog.groom_notes && (
                <div className="portal-dog-notes">{dog.groom_notes}</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
              {dog.size && (
                <span className={`portal-size-badge portal-size-badge--${dog.size}`}>{dog.size}</span>
              )}
              {dog.alerts && dog.alerts.length > 0 && (
                <span className="portal-alert-badge">{"\u26A0\uFE0F"} {dog.alerts.length} alert{dog.alerts.length > 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
