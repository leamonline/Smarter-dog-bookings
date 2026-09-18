import { useState, useEffect, useMemo, useRef } from "react";
import { SERVICES, BOOKING_STATUS } from "../../../constants/index";
import { logger } from "../../../lib/logger";
import { ChevronRight, Scissors } from "lucide-react";
import { PanelShell } from "../shell/index.js";

const COLLAPSED_ROWS = 5;

function formatBookingDate(iso) {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

export function GroomingHistory({
  dogId,
  fetchBookingHistoryForDog,
  onOpenBooking,
}) {
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!dogId || !fetchBookingHistoryForDog) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timeout = setTimeout(() => {
      if (!cancelled) {
        setError("Request timed out");
        setLoading(false);
      }
    }, 8000);

    fetchBookingHistoryForDog(dogId)
      .then((data) => {
        if (!cancelled) {
          clearTimeout(timeout);
          setHistory(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          clearTimeout(timeout);
          logger.error("GroomingHistory fetch failed", err, {
            tags: { component: "GroomingHistory", op: "fetch-history" },
          });
          setError(err.message || "Unknown error");
          setLoading(false);
        }
      });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [dogId, fetchBookingHistoryForDog]);

  const completed = useMemo(
    () => history.filter((b) => b.status === BOOKING_STATUS.READY_FOR_COLLECTION),
    [history],
  );

  const lastVisitWeeksAgo = useMemo(() => {
    if (completed.length === 0) return null;
    const lastDate = new Date(completed[0].date);
    const now = new Date();
    const diffMs = now - lastDate;
    return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  }, [completed]);

  const frequencyRange = useMemo(() => {
    if (completed.length < 2) return null;
    const gaps = [];
    for (let i = 0; i < completed.length - 1; i++) {
      const a = new Date(completed[i].date);
      const b = new Date(completed[i + 1].date);
      const diffWeeks = Math.round(Math.abs(a - b) / (7 * 24 * 60 * 60 * 1000));
      if (diffWeeks > 0) gaps.push(diffWeeks);
    }
    if (gaps.length === 0) return null;
    const min = Math.min(...gaps);
    const max = Math.max(...gaps);
    return { min, max, avg: Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) };
  }, [completed]);

  const isOverdue = useMemo(() => {
    if (lastVisitWeeksAgo === null || frequencyRange === null) return false;
    return lastVisitWeeksAgo > frequencyRange.max + 1;
  }, [lastVisitWeeksAgo, frequencyRange]);

  const handleRetry = () => {
    if (!dogId || !fetchBookingHistoryForDog) return;
    setLoading(true);
    setError(null);

    const timeout = setTimeout(() => {
      if (mountedRef.current) { setError("Request timed out"); setLoading(false); }
    }, 8000);

    fetchBookingHistoryForDog(dogId)
      .then((data) => { clearTimeout(timeout); if (mountedRef.current) { setHistory(data); setLoading(false); } })
      .catch((err) => { clearTimeout(timeout); if (mountedRef.current) { setError(err.message || "Unknown error"); setLoading(false); } });
  };

  return (
    <PanelShell eyebrow="Grooming history" icon={Scissors} accent="amber" className="mb-3">
      {loading && (
        <div className="text-xs text-slate-500 py-1" role="status">
          Loading...
        </div>
      )}

      {!loading && error && (
        <div
          onClick={handleRetry}
          className="text-xs text-brand-coral cursor-pointer py-1"
        >
          Couldn't load history. Tap to retry.
        </div>
      )}

      {!loading && !error && (
        <>
          {lastVisitWeeksAgo !== null && (
            <div className="text-xs text-slate-500 mb-1 py-1">
              {isOverdue ? (
                <span className="text-brand-coral font-bold">
                  Overdue — last visit was {lastVisitWeeksAgo} week{lastVisitWeeksAgo !== 1 ? "s" : ""} ago
                </span>
              ) : (
                <span>
                  Last visit:{" "}
                  <span className="font-semibold text-slate-800">
                    {lastVisitWeeksAgo} week{lastVisitWeeksAgo !== 1 ? "s" : ""} ago
                  </span>
                </span>
              )}
            </div>
          )}

          {frequencyRange && (
            <div className="text-xs text-slate-500 mb-2">
              Usually every{" "}
              <span className="font-semibold text-slate-800">
                {frequencyRange.min === frequencyRange.max
                  ? `${frequencyRange.min} week${frequencyRange.min !== 1 ? "s" : ""}`
                  : `${frequencyRange.min}\u2013${frequencyRange.max} weeks`}
              </span>
            </div>
          )}

          {history.length === 0 ? (
            <div className="text-xs text-slate-400 italic py-1">
              No previous visits recorded.
            </div>
          ) : (
            (expanded ? history : history.slice(0, COLLAPSED_ROWS)).map((b, i, rows) => {
              const svc = SERVICES.find((s) => s.id === b.service);
              const formattedDate = formatBookingDate(b.date || b._bookingDate);
              const canOpen = Boolean(onOpenBooking && b.id);
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-800">
                      {formattedDate}
                    </span>
                    <span className="text-slate-500 ml-1.5">
                      {svc?.name || b.service}
                    </span>
                  </div>
                  <span
                    className="font-semibold text-[11px] shrink-0"
                    style={{
                      color: b.status === BOOKING_STATUS.READY_FOR_COLLECTION ? "#16A34A" : undefined,
                    }}
                  >
                    {b.status === BOOKING_STATUS.READY_FOR_COLLECTION ? "Finished" : b.status}
                  </span>
                  {canOpen && (
                    <ChevronRight
                      size={13}
                      strokeWidth={2.4}
                      aria-hidden="true"
                      className="shrink-0 text-slate-300 group-hover/history-row:text-brand-teal transition-colors"
                    />
                  )}
                </>
              );

              return (
                <div
                  key={`${b.date}-${b.id || b.slot}-${i}`}
                  className={`group/history-row ${
                    i === rows.length - 1 ? "" : "border-b border-slate-100"
                  }`}
                >
                  {canOpen ? (
                    <button
                      type="button"
                      onClick={() => onOpenBooking(b.id, b)}
                      aria-label={`Open appointment on ${formattedDate}`}
                      className="w-full flex items-center gap-2 py-2 px-1 -mx-1 text-xs text-left font-inherit bg-transparent border-none cursor-pointer rounded transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 py-2 text-xs">
                      {content}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {history.length > COLLAPSED_ROWS && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-left text-[12px] font-bold text-brand-teal-text bg-transparent border-none cursor-pointer font-inherit py-2 hover:text-brand-teal transition-colors"
            >
              {expanded ? "Show fewer" : `Show all ${history.length} \u2192`}
            </button>
          )}
        </>
      )}
    </PanelShell>
  );
}
