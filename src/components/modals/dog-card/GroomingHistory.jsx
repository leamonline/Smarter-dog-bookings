import { useState, useEffect, useMemo, useRef } from "react";
import { SERVICES } from "../../../constants/index.js";
import { SectionCard } from "../booking-detail/shared.jsx";

export function GroomingHistory({ dogId, fetchBookingHistoryForDog, accentColour }) {
  const [history, setHistory] = useState([]);
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
          console.error("GroomingHistory fetch error:", err);
          setError(err.message || "Unknown error");
          setLoading(false);
        }
      });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [dogId, fetchBookingHistoryForDog]);

  const completed = useMemo(
    () => history.filter((b) => b.status === "Ready for pick-up"),
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
    <SectionCard title="Grooming History">
      {loading && (
        <div className="text-xs text-slate-400 py-1">
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
            history.map((b, i) => {
              const svc = SERVICES.find((s) => s.id === b.service);
              return (
                <div
                  key={`${b.date}-${b.id || b.slot}-${i}`}
                  className={`flex justify-between items-center py-2 text-xs ${
                    i === history.length - 1 ? "" : "border-b border-slate-100"
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-800">
                      {b.date?.split("-").reverse().join("-")}
                    </span>
                    <span className="text-slate-500 ml-1.5">
                      {svc?.icon} {svc?.name || b.service}
                    </span>
                  </div>
                  <span
                    className="font-semibold text-[11px]"
                    style={{
                      color: b.status === "Ready for pick-up" ? "#16A34A" : undefined,
                    }}
                  >
                    {b.status === "Ready for pick-up" ? "Finished" : b.status}
                  </span>
                </div>
              );
            })
          )}
        </>
      )}
    </SectionCard>
  );
}
