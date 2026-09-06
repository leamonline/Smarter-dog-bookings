import { useEffect, useState } from 'react';
import { loadHolidays, saveHoliday, type Holiday } from '../../../supabase/holidays';
import { formatHolidayDate, holidayCopy, londonDate } from '../../../engine/holidayNotice';
import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import { Button as UntypedButton } from '../../ui/index.js';

// Button.jsx is untyped; give it the props this screen uses.
const Button = UntypedButton as unknown as ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'link'; size?: 'sm' | 'md'; children: ReactNode }>;
import { Card, CardBody, CardHead, INPUT_CLS, ReadOnlyNotice, SECTION_LABEL_CLS } from './shared.jsx';

const FIELDS: { key: 'notice_from' | 'closed_from' | 'reopens_on'; label: string; hint: string }[] = [
  { key: 'notice_from', label: 'Show advance notice from', hint: 'The website and booking calendar start mentioning the holiday on this date.' },
  { key: 'closed_from', label: 'First closed date', hint: 'Every day from here up to the day before you reopen is closed in the diary.' },
  { key: 'reopens_on', label: 'Reopening date', hint: 'Must be a day you are open: a normal Mon–Wed, or a date you have opened in Bookings.' },
];

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

  const valid = Boolean(draft && draft.notice_from && draft.closed_from && draft.reopens_on
    && draft.notice_from <= draft.closed_from && draft.closed_from < draft.reopens_on);
  const orderProblem = draft && draft.notice_from && draft.closed_from && draft.reopens_on && !valid
    ? 'Dates must run in order: notice start, then first closed date, then a later reopening date.'
    : '';

  const submit = async () => {
    if (!draft || !canEdit || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await saveHoliday(draft);
      setMessage(draft.enabled
        ? 'Holiday saved. Those dates are now closed and any affected appointments are flagged in Tasks for rearrangement.'
        : 'Notice removed. The diary dates stay closed; reopen them in Bookings if you need to.');
      setDraft(null); await reload();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const startDraft = () => {
    setMessage('');
    setDraft({ id: crypto.randomUUID(), revision: 0, notice_from: londonDate(), closed_from: '', reopens_on: '', enabled: true });
  };

  const active = holidays.filter(h => h.enabled);

  return (
    <Card id="holiday-settings">
      <CardHead
        variant="yellow"
        title="Holidays"
        desc="Tell customers about a break, backed by real closed dates in the diary."
        right={<Button variant="ghost" size="sm" disabled={busy || draft !== null} onClick={() => void reload()}>Reload holidays</Button>}
      />
      <CardBody>
        {!canEdit && <ReadOnlyNotice>You can view holidays here, but only the owner can add or change them.</ReadOnlyNotice>}
        <p className="text-body text-slate-700 mb-4">
          Saving a holiday closes every day from the first closed date up to the day before you reopen, and schedules the
          notice on the website and in the customer booking calendar. Nothing is sent to customers automatically.
        </p>

        {error && (
          <div role="alert" className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="text-[13px] text-brand-teal-dark font-semibold bg-[#E6F5F2] px-3 py-2 rounded-lg mb-4">
            {message}
          </div>
        )}

        {ready && active.length === 0 && !draft && (
          <p className="text-body text-slate-500 mb-4">No holiday scheduled. Customers see the normal calendar.</p>
        )}
        {active.map(h => (
          <div key={h.id} className="border-[1.5px] border-slate-200 rounded-control p-3.5 mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-body text-slate-800">
              <div className="font-bold">Closed {formatHolidayDate(h.closed_from)} to {formatHolidayDate(h.reopens_on)}</div>
              <div className="text-slate-600">Reopens {formatHolidayDate(h.reopens_on)} · notice shows from {formatHolidayDate(h.notice_from)}</div>
            </div>
            <Button variant="ghost" size="sm" disabled={!canEdit || busy || !!draft} onClick={() => { setMessage(''); setDraft(h); }}>Edit holiday</Button>
          </div>
        ))}

        {!draft && (
          <Button variant="primary" disabled={!canEdit || !ready} onClick={startDraft}>Add holiday</Button>
        )}

        {draft && (
          <form className="mt-2 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
            <div className="grid gap-4 md:grid-cols-3">
              {FIELDS.map(({ key, label, hint }) => (
                <div key={key}>
                  <label htmlFor={`holiday-${key}`} className={`${SECTION_LABEL_CLS} block`}>{label}</label>
                  <input id={`holiday-${key}`} type="date" required value={draft[key]} disabled={busy || !canEdit} className={INPUT_CLS}
                    aria-describedby={`holiday-${key}-hint`} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
                  <p id={`holiday-${key}-hint`} className="text-[12px] text-slate-500 mt-1">{hint}</p>
                </div>
              ))}
            </div>
            {orderProblem && <p className="text-[13px] text-brand-coral font-semibold">{orderProblem}</p>}
            {draft.revision > 0 && (
              <label className="flex items-center gap-2 text-body text-slate-800">
                <input type="checkbox" checked={draft.enabled} disabled={busy || !canEdit} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
                Show the scheduled notice and protect these holiday dates
              </label>
            )}
            {valid && draft.enabled && (
              <div className="rounded-control bg-amber-50 border border-amber-200 p-4 text-body text-slate-800 space-y-2">
                <div className="font-bold">What customers will see</div>
                <div><span className="font-semibold">From {formatHolidayDate(draft.notice_from)}:</span> “{holidayCopy({ ...draft, phase: 'upcoming' }).title}” — {holidayCopy({ ...draft, phase: 'upcoming' }).text}</div>
                <div><span className="font-semibold">From {formatHolidayDate(draft.closed_from)}:</span> “{holidayCopy({ ...draft, phase: 'away' }).title}” — {holidayCopy({ ...draft, phase: 'away' }).text}</div>
                <div><span className="font-semibold">From {formatHolidayDate(draft.reopens_on)}:</span> the notice disappears on its own.</div>
              </div>
            )}
            <p className="text-[12px] text-slate-600">
              {draft.enabled
                ? 'Existing appointments on closed days stay in the diary and are flagged for rearrangement. Changing the dates never reopens days from the previous range.'
                : 'Removing the notice does not reopen any diary dates or remove rearrangement tasks.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" disabled={!valid || busy || !canEdit}>
                {busy ? 'Saving…' : draft.enabled ? 'Save holiday and close dates' : 'Remove notice; keep dates closed'}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Cancel</Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
