import { useNavigate } from "react-router-dom";
import {
  SERVICE_LABELS,
  SERVICE_ICONS,
  STATUS_STYLES,
  formatSlot,
  formatDate,
  cardAnim,
} from "./dashboardConstants.js";
import { AddToCalendarButton } from "./AddToCalendarButton.js";

export function AppointmentsSection({
  upcomingBookings,
  pastBookings,
  pastExpanded,
  setPastExpanded,
  hasMorePast,
  loadingMore,
  onLoadMore,
  cancellingId,
  cancelReason,
  setCancelReason,
  cancelOther,
  setCancelOther,
  saving,
  onStartCancel,
  onConfirmCancel,
  onCancelBack,
  onSubscribe,
}) {
  const navigate = useNavigate();

  return (
    <>
      {/* ---- UPCOMING APPOINTMENTS ---- */}
      <div className="pink-card" style={cardAnim(0.26)}>
        <div className="pink-card-header">
          <span className="pink-card-icon" aria-hidden="true">{"\uD83D\uDCC5"}</span>
          <h2 className="pink-card-title">Upcoming Appointments</h2>
          {onSubscribe && upcomingBookings.length > 0 && (
            <button
              onClick={onSubscribe}
              className="ml-auto bg-transparent border-none text-[12px] text-brand-teal font-semibold cursor-pointer hover:underline"
            >
              Sync to calendar
            </button>
          )}
        </div>
        {upcomingBookings.length === 0 ? (
          <div className="portal-empty">
            <div className="portal-empty-icon">{"\uD83D\uDC3E"}</div>
            <p className="portal-empty-title">No upcoming appointments</p>
            <p className="portal-empty-text">Book your next groom using the button above!</p>
          </div>
        ) : (
          upcomingBookings.map(b => {
            const sc = STATUS_STYLES[b.status] || STATUS_STYLES["No-show"];
            const canCancel = b.status === "No-show";

            return (
              <div key={b.id} className="portal-booking-item">
                <div className="portal-booking-top">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                      <span className="portal-booking-date">{formatDate(b.booking_date)}</span>
                      <span className="portal-upcoming-badge">UPCOMING</span>
                    </div>
                    <div className="portal-booking-detail">
                      {b.dogs?.name || "Unknown"}{" "}
                      <span className="portal-booking-service">
                        {SERVICE_ICONS[b.service] || ""} {SERVICE_LABELS[b.service] || b.service}
                      </span>
                    </div>
                    {b.slot && (
                      <div className="portal-booking-time">{formatSlot(b.slot)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <AddToCalendarButton bookingId={b.id} compact />
                    <span className="portal-status-badge" style={sc}>{b.status}</span>
                  </div>
                </div>

                {canCancel && cancellingId !== b.id && (
                  <button
                    className="wobbly-btn wobbly-btn--danger"
                    style={{ width: "100%", marginTop: "10px", padding: "10px", fontSize: "13px" }}
                    onClick={() => onStartCancel(b.id)}
                  >
                    Cancel appointment
                  </button>
                )}

                {cancellingId === b.id && (
                  <div className="portal-cancel-panel">
                    <div className="portal-cancel-title">Why are you cancelling?</div>
                    <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="portal-cancel-select">
                      <option value="">Select a reason...</option>
                      <option value="Changed plans">Changed plans</option>
                      <option value="Dog unwell">Dog unwell</option>
                      <option value="Found another date">Found another date</option>
                      <option value="Other">Other</option>
                    </select>
                    {cancelReason === "Other" && (
                      <input
                        type="text"
                        value={cancelOther}
                        onChange={e => setCancelOther(e.target.value)}
                        placeholder="Please tell us why..."
                        className="portal-cancel-input"
                      />
                    )}
                    <div className="portal-cancel-actions">
                      <button
                        className="wobbly-btn wobbly-btn--danger"
                        style={{ flex: 1, padding: "10px", fontSize: "13px" }}
                        onClick={onConfirmCancel}
                        disabled={saving || (!cancelReason || (cancelReason === "Other" && !cancelOther.trim()))}
                      >
                        {saving ? "Cancelling..." : "Confirm cancellation"}
                      </button>
                      <button
                        className="wobbly-btn wobbly-btn--cancel-text"
                        onClick={onCancelBack}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ---- REBOOK PROMPT ---- */}
      {upcomingBookings.length === 0 && pastBookings.some(b => b.status === "Ready for pick-up" || b.status === "Finished") && (
        <div className="portal-rebook">
          <div className="portal-rebook-icon">{"\u2702\uFE0F"}</div>
          <h3 className="portal-rebook-title">Time for another groom?</h3>
          <p className="portal-rebook-text">
            Your last visit was {(() => {
              const lastCompleted = pastBookings.find(b => b.status === "Ready for pick-up" || b.status === "Finished");
              if (!lastCompleted) return "a while ago";
              const diff = Math.round((new Date() - new Date(lastCompleted.booking_date + "T00:00:00")) / (7 * 24 * 60 * 60 * 1000));
              return diff <= 1 ? "last week" : `${diff} weeks ago`;
            })()}
          </p>
          <button
            className="wobbly-btn wobbly-btn--book"
            style={{ marginBottom: 0 }}
            onClick={() => navigate("/customer/book")}
          >
            {"\uD83D\uDC3E"} Book your next appointment
          </button>
        </div>
      )}

      {/* ---- PAST APPOINTMENTS ---- */}
      <div className="pink-card" style={cardAnim(0.33)}>
        <button className="portal-past-toggle" onClick={() => setPastExpanded(p => !p)}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="pink-card-icon" aria-hidden="true">{"\uD83D\uDCCB"}</span>
            <h2 className="pink-card-title" style={{ margin: 0 }}>Past Appointments ({pastBookings.length})</h2>
          </div>
          <span className="portal-past-arrow">{pastExpanded ? "\u25B2 Hide" : "\u25BC Show"}</span>
        </button>

        {pastExpanded && (
          <>
            {pastBookings.length === 0 ? (
              <div className="portal-empty" style={{ paddingTop: "12px" }}>
                <p className="portal-empty-text" style={{ fontStyle: "italic" }}>No past appointments yet.</p>
              </div>
            ) : (
              pastBookings.map(b => {
                const sc = STATUS_STYLES[b.status] || STATUS_STYLES["Ready for pick-up"];
                return (
                  <div key={b.id} className="portal-booking-item" style={{ opacity: 0.65 }}>
                    <div className="portal-booking-top">
                      <div style={{ flex: 1 }}>
                        <span className="portal-booking-date">{formatDate(b.booking_date)}</span>
                        <div className="portal-booking-detail">
                          {b.dogs?.name || "Unknown"}{" "}
                          <span className="portal-booking-service">
                            {SERVICE_ICONS[b.service] || ""} {SERVICE_LABELS[b.service] || b.service}
                          </span>
                        </div>
                        {b.slot && <div className="portal-booking-time">{formatSlot(b.slot)}</div>}
                      </div>
                      <span className="portal-status-badge" style={sc}>{b.status}</span>
                    </div>
                  </div>
                );
              })
            )}

            {hasMorePast && (
              <button
                className="wobbly-btn wobbly-btn--cancel-text"
                style={{ width: "100%", marginTop: "12px", padding: "10px", fontSize: "13px" }}
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load more past appointments"}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
