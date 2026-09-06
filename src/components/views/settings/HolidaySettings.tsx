import { useEffect, useState } from 'react';
import { loadHolidays, saveHoliday, type Holiday } from '../../../supabase/holidays';
import { holidayCopy, londonDate } from '../../../engine/holidayNotice';

export function HolidaySettings({ canEdit = true, onDirtyChange }: { canEdit?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [draft, setDraft] = useState<Holiday | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const reload = async () => {
    setError('');
    try { setHolidays(await loadHolidays()); setReady(true); }
    catch (err) { setError((err as Error).message); }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => { onDirtyChange?.(draft !== null); return () => onDirtyChange?.(false); }, [draft, onDirtyChange]);
  const valid = draft && draft.notice_from && draft.closed_from && draft.reopens_on && draft.notice_from <= draft.closed_from && draft.closed_from < draft.reopens_on;
  const submit = async () => {
    if (!draft || !canEdit || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await saveHoliday(draft);
      setMessage(draft.enabled ? 'Holiday saved. Dates are closed and affected appointments are flagged in Tasks for rearrangement.' : 'Notice removed. Diary dates remain closed; reopen them in Bookings if needed.');
      setDraft(null); await reload();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" aria-labelledby="holiday-heading">
    <h2 id="holiday-heading" className="text-xl font-bold">Holidays</h2>
    <p>Schedule a notice on the website and booking calendar, backed by actual closed dates. Open your reopening date in the diary first.</p>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" disabled={busy || draft !== null} onClick={() => void reload()}>Reload holidays</button>
    {holidays.filter(h => h.enabled).map(h => <div key={h.id} className="border rounded-xl p-3 flex flex-wrap items-center gap-3">
      <span>Closed from {h.closed_from} · Reopens {h.reopens_on} · Notice from {h.notice_from}</span>
      <button type="button" disabled={!canEdit || busy || !!draft} onClick={() => { setMessage(''); setDraft(h); }}>Edit holiday</button>
    </div>)}
    {!draft && <button type="button" className="wizard-btn wizard-btn--primary" disabled={!canEdit || !ready} onClick={() => { setMessage(''); setDraft({ id: crypto.randomUUID(), revision: 0, notice_from: londonDate(), closed_from: '', reopens_on: '', enabled: true }); }}>Add holiday</button>}
    {draft && <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      {(['notice_from', 'closed_from', 'reopens_on'] as const).map((key, i) => <label key={key} className="block">
        <span className="block font-semibold">{['Show advance notice from', 'First closed date', 'Reopening date'][i]}</span>
        <input type="date" required value={draft[key]} disabled={busy || !canEdit} className="border rounded-lg p-2 w-full max-w-xs" onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
      </label>)}
      {draft.revision > 0 && <label className="flex gap-2"><input type="checkbox" checked={draft.enabled} disabled={busy || !canEdit} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />Show scheduled notice and protect holiday dates</label>}
      {valid && draft.enabled && <div className="rounded-xl bg-sky-50 p-4"><h3 className="font-bold">Preview during your holiday</h3><p>{holidayCopy({ ...draft, phase: 'away' }).text}</p></div>}
      <p>{draft.enabled ? 'Saving closes every day from the first closed date up to (but not including) reopening. Existing appointments stay in the diary and are flagged for rearrangement. Editing dates does not reopen days from the previous range.' : 'Removing this notice does not reopen any diary dates or remove rearrangement tasks.'}</p>
      <div className="flex flex-wrap gap-3"><button type="submit" className="wizard-btn wizard-btn--primary" disabled={!valid || busy || !canEdit}>{busy ? 'Saving…' : draft.enabled ? 'Save holiday and close dates' : 'Remove notice; keep dates closed'}</button><button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
  </section>;
}
