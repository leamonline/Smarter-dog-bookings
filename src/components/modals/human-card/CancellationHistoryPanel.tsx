import { useEffect, useState } from "react";
import { getCancellationHistory, waiveCancellation, type CancellationHistory } from "../../../supabase/repositories/cancellationHistoryRepo";

export function CancellationHistoryPanel({ humanId }: { humanId: string }) {
  const [history, setHistory] = useState<CancellationHistory | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [waiving, setWaiving] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    setHistory(null); setError(false);
    getCancellationHistory(humanId).then((value) => { if (live) setHistory(value); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [humanId, refresh]);
  const waive = async () => {
    if (!waiving || !reason.trim()) return;
    setSaving(true);
    try { await waiveCancellation(waiving, reason.trim()); setWaiving(null); setReason(""); setRefresh((n) => n + 1); }
    catch { setError(true); }
    finally { setSaving(false); }
  };
  return <section aria-label="Late cancellations" className="rounded-xl border border-slate-200 p-3">
    <h3 className="text-sm font-bold">Late cancellations</h3>
    {error ? <p role="alert">Couldn’t load or update cancellation history. <button type="button" onClick={() => setRefresh((n) => n + 1)}>Try again</button></p> : !history ? <p role="status">Loading cancellation history…</p> : <>
      <p>{history.count} in the last 12 months</p>
      {history.reviewRequired && <p className="text-amber-800 font-semibold">Review deposits: three or more late cancellations. Use the Deposit required switch if appropriate.</p>}
      <p className="text-xs text-slate-500">Latest 50 records shown. One record per appointment. Waived records do not count. Deposits remain a staff decision.</p>
      {!history.items.length ? <p>No late cancellations recorded.</p> : <ul>{history.items.map((item) => <li key={item.id} className="border-t py-2 text-sm">
        <p>Appointment: {item.bookingDate} · Cancelled {new Date(item.requestedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>
        <p>{item.reason}</p>
        {item.waivedAt ? <p>Waived: {item.waiverReason}</p> : <button type="button" onClick={() => { setWaiving(item.id); setReason(""); }}>Waive this record</button>}
        {waiving === item.id && <div><label>Reason for waiver<input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label><button type="button" disabled={saving || !reason.trim()} onClick={waive}>Save waiver</button><button type="button" disabled={saving} onClick={() => setWaiving(null)}>Keep record</button></div>}
      </li>)}</ul>}
    </>}
  </section>;
}
