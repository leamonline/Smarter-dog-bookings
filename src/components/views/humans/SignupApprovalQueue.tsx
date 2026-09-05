import { useState } from "react";
import { Clock, ArrowRight, RefreshCw } from "lucide-react";
import { useSignupApprovalQueue } from "../../../supabase/hooks/humans/useSignupApprovalQueue";
import { SIGNUP_PAGE_SIZE } from "../../../supabase/repositories/signupApprovalRepo";
import type { ApproveSignup } from "../../../supabase/hooks/humans/useSignupReview";
import { SignupReviewPanel } from "./SignupReviewPanel";

function submittedLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Submission time unavailable";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return "Waiting less than a day";
  if (days === 1) return "Waiting 1 day";
  return `Waiting ${days} days`;
}
const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple disabled:opacity-50";

export function SignupApprovalQueue({ enabled, onApprove }: { enabled: boolean; onApprove: ApproveSignup }) {
  const queue = useSignupApprovalQueue(enabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  return (
    <section aria-label="Awaiting approval" className="mb-5 overflow-hidden rounded-2xl border border-brand-teal/25 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-teal/5 px-4 py-3 sm:px-5">
        <button type="button" aria-label={!queue.error && enabled && !queue.loading ? `Awaiting approval, ${queue.total} customers` : "Awaiting approval"} aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className={`${action} -ml-3 text-brand-purple`}>
          <Clock size={19} aria-hidden="true" /> Awaiting approval
          {!queue.error && enabled && <span className="rounded-full bg-white px-2.5 py-0.5 text-sm">{queue.loading ? "…" : queue.total}</span>}
        </button>
        <button type="button" className={`${action} text-brand-teal`} disabled={!enabled || queue.loading} onClick={() => void queue.refresh()} aria-label="Refresh approvals"><RefreshCw size={16} aria-hidden="true" /><span>Refresh</span></button>
      </div>
      {!enabled ? <p className="px-5 py-3 text-sm text-slate-600">Awaiting approvals is available when connected to the live app.</p> : queue.error ? <div role="alert" className="p-5 text-sm text-red-800">{queue.error} <button className={action} onClick={() => void queue.refresh()}>Try again</button></div> : queue.loading && !queue.customers.length ? <p role="status" className="p-5 text-sm text-slate-600">Loading awaiting approvals…</p> : queue.total === 0 ? <p className="px-5 py-3 text-sm text-slate-600">All caught up — no customers awaiting approval.</p> : expanded && <>
        <p className="px-5 pt-3 text-xs text-slate-500">Oldest first · Check dog sizes before approving</p>
        <ul className="divide-y divide-slate-100 px-4 sm:px-5" aria-busy={queue.loading}>
          {queue.customers.map(customer => <li key={customer.id} className="flex items-center gap-3 py-4">
            <div className="min-w-0 flex-1">
              <p className="break-words font-bold text-brand-purple">{customer.name}</p>
              <p className="mt-1 break-words text-sm text-slate-600">{customer.dogs.length ? customer.dogs.map(dog => dog.name).join(", ") : "No dogs linked"}</p>
              <p className="mt-1 text-xs text-slate-500"><time dateTime={customer.submittedAt}>{submittedLabel(customer.submittedAt)}</time></p>
            </div>
            <button type="button" className={`${action} shrink-0 bg-brand-purple text-white`} onClick={() => setSelectedId(customer.id)} aria-label={`Review ${customer.name}`}>Review <ArrowRight size={15} aria-hidden="true" /></button>
          </li>)}
        </ul>
        {queue.total > SIGNUP_PAGE_SIZE && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-2">
          <p className="text-xs text-slate-500">{queue.page * SIGNUP_PAGE_SIZE + 1}–{Math.min((queue.page + 1) * SIGNUP_PAGE_SIZE, queue.total)} of {queue.total}</p>
          <div className="flex gap-2">
            <button className={action} disabled={queue.loading || queue.page === 0} onClick={() => queue.setPage(queue.page - 1)}>Previous</button>
            <button className={action} disabled={queue.loading || (queue.page + 1) * SIGNUP_PAGE_SIZE >= queue.total} onClick={() => queue.setPage(queue.page + 1)}>Next</button>
          </div>
        </div>}
      </>}
      {selectedId && <SignupReviewPanel key={selectedId} humanId={selectedId} enabled={enabled} onApprove={onApprove} onClose={() => { setSelectedId(null); void queue.refresh(); }} />}
    </section>
  );
}
