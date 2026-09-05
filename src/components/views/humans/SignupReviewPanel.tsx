import { useId, useState } from "react";
import { Check, X, PawPrint } from "lucide-react";
import { DrawerShell } from "../../shared/DrawerShell";
import { DOG_SIZES } from "../../../constants/salon";
import { useSignupReview, type ApproveSignup } from "../../../supabase/hooks/humans/useSignupReview";

export interface SignupReviewPanelProps {
  humanId: string;
  onApprove: ApproveSignup;
  onClose: () => void;
  enabled: boolean;
}
const button = "min-h-11 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple disabled:opacity-50 disabled:cursor-not-allowed";

export function SignupReviewPanel({ humanId, onApprove, onClose, enabled }: SignupReviewPanelProps) {
  const titleId = useId();
  const missingId = useId();
  const state = useSignupReview(humanId, onApprove, enabled);
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => {
    if (state.busy) return;
    if (state.dirty && !state.outcome) { setConfirmClose(true); return; }
    onClose();
  };
  const welcome = state.outcome?.ok ? state.outcome.welcomeStatus : undefined;
  return (
    <DrawerShell onClose={close} titleId={titleId} widthClass="max-w-xl" dismissOnEscape={!state.busy}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">New customer</p>
          <h2 id={titleId} className="mt-1 text-xl font-bold text-brand-purple">{state.outcome?.ok ? "Customer approved" : "Review signup"}</h2>
        </div>
        <button type="button" onClick={close} disabled={state.busy} className={`${button} px-3`} aria-label="Close review"><X size={20} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {confirmClose && <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert">
          <p className="text-sm font-semibold">Discard your unsaved size choices?</p>
          <p className="mt-1 text-sm">Sizes already saved will be kept.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={`${button} bg-white border border-slate-200`} onClick={() => setConfirmClose(false)}>Keep reviewing</button>
            <button className={button} disabled={state.busy} onClick={() => { if (!state.busy) onClose(); }}>Discard and close</button>
          </div>
        </div>}
        {state.loading ? <p role="status">Loading customer and dogs…</p> : state.outcome?.ok ? (
          <div role="status" className="rounded-2xl border border-brand-teal/30 bg-white p-5">
            <Check className="mb-3 text-brand-teal" size={28} aria-hidden="true" />
            <h3 className="font-bold text-brand-purple">{state.review?.name} is approved</h3>
            <p className="mt-2 text-sm text-slate-600">The dog sizes have been saved.</p>
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-700">
              {welcome === "accepted" ? "Welcome message accepted by the provider. Delivery is not yet confirmed."
                : welcome === "failed" ? "The welcome message could not be sent. Approval is complete; check messaging before contacting the customer."
                : welcome === "previously-requested" ? "A welcome message was already requested. Check messaging for its status."
                : "Welcome message status is unconfirmed. Approval is complete; check messaging before retrying."}
            </p>
          </div>
        ) : state.review ? (
          <>
            <section aria-label="Customer details" className="mb-6">
              <h3 className="break-words text-xl font-bold text-brand-purple">{state.review.name}</h3>
              <p className="mt-2 break-words text-sm text-slate-600">{state.review.phone || "No phone number"}</p>
              {state.review.email && <p className="mt-1 break-all text-sm text-slate-600">{state.review.email}</p>}
            </section>
            <h3 className="mb-2 flex items-center gap-2 font-bold text-brand-purple"><PawPrint size={18} aria-hidden="true" />Confirm booking sizes</h3>
            <p className="mb-4 text-sm text-slate-600">Check each dog's size for booking. Customer-reported sizes are a guide for your review.</p>
            <div className="space-y-4">
              {state.review.activeDogs.map(dog => <fieldset key={dog.id} disabled={state.busy || state.needsReload || !enabled} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                <legend className="max-w-full break-words px-1 font-bold text-brand-purple">{dog.name}</legend>
                <p className="break-words text-sm text-slate-600">{dog.breed || "Breed not provided"}</p>
                <p className="mt-2 text-xs text-slate-600">{dog.size ? `Current booking size: ${dog.size}` : "Needs size confirmation"}</p>
                {dog.reportedSize && <p className="mt-1 text-xs text-slate-500">Customer reported: {dog.reportedSize}</p>}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {DOG_SIZES.map(size => <label key={size} className="relative cursor-pointer">
                    <input type="radio" className="peer sr-only" name={`size-${dog.id}`} value={size} checked={state.sizes[dog.id] === size} onChange={() => state.chooseSize(dog.id, size)} aria-label={`${dog.name}: ${size}`} />
                    <span className="flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-sm font-bold capitalize text-slate-600 peer-checked:border-brand-purple peer-checked:bg-brand-purple peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-teal peer-disabled:opacity-50">{size}</span>
                  </label>)}
                </div>
              </fieldset>)}
            </div>
            {state.review.activeDogs.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-600">No active dogs linked to this signup.</p>}
          </>
        ) : null}
        {state.error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p>{state.error}</p>
          <button className={`${button} mt-2 bg-white`} disabled={state.busy || !enabled} onClick={() => { setConfirmClose(false); void state.reload(); }}>Reload review</button>
          {state.dirty && <p className="mt-2 text-xs">Reloading replaces unsaved choices with the latest saved sizes.</p>}
        </div>}
        {state.saved && !state.error && <p role="status" className="mt-4 text-sm font-semibold text-brand-teal">Sizes saved. This customer is still awaiting approval.</p>}
        {!enabled && <p role="alert" className="mt-4 text-sm">Reconnect before saving or approving.</p>}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        {state.outcome?.ok ? <button className={`${button} w-full bg-brand-purple text-white`} onClick={onClose}>Back to approvals</button> : <>
          <p id={missingId} className="mb-3 text-sm text-slate-600">{state.missing.length ? `Choose a size for ${state.missing.map(dog => dog.name).join(", ")} to approve.` : "Save the sizes and approve when you're ready."}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className={`${button} flex-1 border border-slate-200 bg-white text-brand-purple`} disabled={state.busy || state.loading || state.needsReload || !enabled || !state.dirty} onClick={() => void state.save(false)}>Save for later</button>
            <button className={`${button} flex-1 bg-brand-purple text-white`} aria-describedby={missingId} disabled={state.busy || state.loading || state.needsReload || !enabled || !state.review || state.missing.length > 0} onClick={() => void state.save(true)}>{state.busy ? "Saving…" : "Save sizes and approve"}</button>
          </div>
        </>}
      </footer>
    </DrawerShell>
  );
}
