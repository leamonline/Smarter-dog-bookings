import { useNavigate } from "react-router-dom";
import {
  SERVICE_LABELS,
  SERVICE_ICON_NAMES,
  STATUS_STYLES,
  formatSlot,
  formatDate,
  cardAnim,
} from "./dashboardConstants.js";
import { AddToCalendarButton } from "./AddToCalendarButton.js";
import { Calendar, ClipboardList, ChevronDown, ChevronUp, PawPrint, Scissors } from "lucide-react";

function customerStatusLabel(status) {
  const statusMap = {
    "No-show": "Awaiting confirmation",
    "Checked in": "Checked in",
    "Ready for pick-up": "Finished",
    "Completed": "Completed",
    "Finished": "Completed",
    "Cancelled": "Cancelled",
  };
  return statusMap[status] || status;
}

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
      <div className="portal-card portal-card--teal" style={cardAnim(0.2)}>
        <div className="portal-card-header">
          <Calendar size={18} className="portal-card-icon" aria-hidden="true" />
          <h2 className="portal-card-title">Upcoming Appointments</h2>
          {onSubscribe && upcomingBookings.length > 0 && (
            <button
              onClick={onSubscribe}
              className="ml-auto bg-transparent border-none text-[12px] text-brand-teal font-semibold cursor-pointer hover:underline font-[inherit]"
            >
              Sync to calendar
            </button>
          )}
        </div>
        {upcomingBookings.length === 0 ? (
          <div className="text-center py-4">
            <Calendar size={32} className="text-slate-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-brand-purple m-0 mb-1">No upcoming appointments</p>
            <p className="text-[13px] text-slate-500 m-0">Book your next groom using the button above!</p>
          </div>
        ) : (
          upcomingBookings.map(b => {
            const sc = STATUS_STYLES[b.status] || STATUS_STYLES["No-show"];
            const canCancel = b.status === "No-show";

            return (
              <div key={b.id} className="py-3 border-b border-slate-100 last:border-b-0">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-brand-purple font-[Sora]">{formatDate(b.booking_date)}</span>
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 py-0.5 px-2 rounded font-[Sora] uppercase tracking-wide">Upcoming</span>
                    </div>
                    <div className="text-sm font-semibold text-brand-purple">
                      {b.dogs?.name || "Unknown"}{" "}
                      <span className="text-slate-500 font-medium">
                        {SERVICE_LABELS[b.service] || b.service}
                      </span>
                    </div>
                    {b.slot && (
                      <div className="text-xs text-slate-400 font-medium mt-0.5">{formatSlot(b.slot)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <AddToCalendarButton bookingId={b.id} compact />
                    <span className="text-[11px] font-bold py-1 px-2.5 rounded-md font-[Sora] whitespace-nowrap" style={sc}>{customerStatusLabel(b.status)}</span>
                  </div>
                </div>

                {canCancel && cancellingId !== b.id && (
                  <button
                    className="portal-btn portal-btn--danger w-full mt-2.5 text-[13px]"
                    onClick={() => onStartCancel(b.id)}
                  >
                    Cancel appointment
                  </button>
                )}

                {cancellingId === b.id && (
                  <div className="mt-2.5 p-3.5 rounded-lg border-l-[3px] border-l-brand-coral bg-pink-50">
                    <div className="text-sm font-semibold text-brand-purple font-[Sora] mb-2.5">Why are you cancelling?</div>
                    <select value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                      className="w-full py-2.5 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none box-border mb-2.5 font-[inherit] transition-colors focus:border-brand-purple">
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
                        className="w-full py-2.5 px-3 rounded-lg border-2 border-slate-200 text-sm font-semibold text-brand-purple bg-white outline-none box-border mb-2.5 font-[inherit] transition-colors focus:border-brand-purple"
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        className="portal-btn portal-btn--danger flex-1 text-[13px]"
                        onClick={onConfirmCancel}
                        disabled={saving || (!cancelReason || (cancelReason === "Other" && !cancelOther.trim()))}
                      >
                        {saving ? "Cancelling..." : "Confirm cancellation"}
                      </button>
                      <button
                        className="portal-btn portal-btn--secondary portal-btn--small"
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
        <div className="portal-card portal-card--yellow" style={cardAnim(0.25)}>
          <div className="text-center py-2">
            <Scissors size={28} className="text-brand-purple mx-auto mb-2" aria-hidden="true" />
            <h3 className="text-base font-bold text-brand-purple font-[Sora] m-0 mb-1">Time for another groom?</h3>
            <p className="text-sm text-slate-500 font-medium m-0 mb-4">
              Your last visit was {(() => {
                const lastCompleted = pastBookings.find(b => b.status === "Ready for pick-up" || b.status === "Finished");
                if (!lastCompleted) return "a while ago";
                const diff = Math.round((new Date() - new Date(lastCompleted.booking_date + "T00:00:00")) / (7 * 24 * 60 * 60 * 1000));
                return diff <= 1 ? "last week" : `${diff} weeks ago`;
              })()}
            </p>
            <button
              className="portal-btn portal-btn--cta"
              onClick={() => navigate("/customer/book")}
            >
              <span className="flex items-center justify-center gap-2">
                <PawPrint size={18} aria-hidden="true" />
                Book your next appointment
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ---- PAST APPOINTMENTS ---- */}
      <div className="portal-card portal-card--muted" style={cardAnim(0.3)}>
        <button className="flex justify-between items-center w-full bg-transparent border-none cursor-pointer p-0 mb-1" onClick={() => setPastExpanded(p => !p)}>
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="portal-card-icon" aria-hidden="true" />
            <h2 className="portal-card-title" style={{ margin: 0 }}>Past Appointments ({pastBookings.length})</h2>
          </div>
          <span className="text-[13px] text-slate-500 font-semibold font-[Sora] flex items-center gap-1">
            {pastExpanded ? <><ChevronUp size={14} aria-hidden="true" /> Hide</> : <><ChevronDown size={14} aria-hidden="true" /> Show</>}
          </span>
        </button>

        {pastExpanded && (
          <>
            {pastBookings.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-[13px] text-slate-500 italic m-0">No past appointments yet.</p>
              </div>
            ) : (
              pastBookings.map(b => {
                const sc = STATUS_STYLES[b.status] || STATUS_STYLES["Ready for pick-up"];
                return (
                  <div key={b.id} className="py-3 border-b border-slate-100 last:border-b-0 opacity-60">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-brand-purple font-[Sora]">{formatDate(b.booking_date)}</span>
                        <div className="text-sm font-semibold text-brand-purple">
                          {b.dogs?.name || "Unknown"}{" "}
                          <span className="text-slate-500 font-medium">
                            {SERVICE_LABELS[b.service] || b.service}
                          </span>
                        </div>
                        {b.slot && <div className="text-xs text-slate-400 font-medium mt-0.5">{formatSlot(b.slot)}</div>}
                      </div>
                      <span className="text-[11px] font-bold py-1 px-2.5 rounded-md font-[Sora] whitespace-nowrap" style={sc}>{customerStatusLabel(b.status)}</span>
                    </div>
                  </div>
                );
              })
            )}

            {hasMorePast && (
              <button
                className="portal-btn portal-btn--secondary w-full mt-3 text-[13px]"
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
