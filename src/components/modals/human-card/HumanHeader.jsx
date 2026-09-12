import { Check, Clock, Copy, Link2, PiggyBank, Pencil, Phone, X } from "lucide-react";
import { titleCase } from "../../../utils/text";
import { telLink, waLink } from "../dog-card/helpers.js";
import { HeaderIconButton, OverflowMenu } from "../shell/index.js";

// Quiet dashboard-style header: warm-navy heading plus dashboard
// right-column chip buttons. (It used to cite DayHeader as the visual
// reference; that component was never mounted anywhere and has gone.)
// Sits in the
// ModalShell header slot so it stays pinned while the body scrolls.
// The copy/call actions are always visible — hover-reveal hid them on
// touch screens — and grow on phones to meet the touch-target floor.

function getInitials(human, fullName) {
  const first = (human?.name || "").trim();
  const last = (human?.surname || "").trim();
  if (first || last) return `${first[0] || ""}${last[0] || ""}`.toUpperCase();
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function HumanHeader({
  human,
  humanFullName,
  isEditing,
  editName,
  setEditName,
  editSurname,
  setEditSurname,
  editPhone,
  setEditPhone,
  onStartEdit,
  onClose,
  canEdit,
  onCopyPhone,
  overflowItems,
  nameInputRef,
  isPendingSignup,
  signupBusy,
  onApproveSignup,
  onRejectSignup,
  // A pending signup whose typed name matched an existing customer
  // (humans.claims_human_id). Approving would create a second record with
  // a placeholder name, so the primary action becomes "Link to <name>".
  claimedHuman,
  onLinkClaimedSignup,
}) {
  const claimedName = claimedHuman
    ? titleCase(
        claimedHuman.fullName ||
          `${claimedHuman.name || ""} ${claimedHuman.surname || ""}`.trim(),
      )
    : "";
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div
          aria-hidden="true"
          className="w-[46px] h-[46px] rounded-full bg-[#E6F5F2] text-brand-purple font-display font-bold text-base flex items-center justify-center shrink-0 mt-0.5"
        >
          {getInitials(human, humanFullName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-label text-ink-muted">
              Human profile
            </span>
            {isPendingSignup && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                <Clock size={10} strokeWidth={2.6} aria-hidden="true" />
                Pending approval
              </span>
            )}
            {human?.depositRequired && (
              <span
                title="Every booking for this customer awaits a bank-transfer deposit"
                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider"
              >
                <PiggyBank size={10} strokeWidth={2.6} aria-hidden="true" />
                Deposit customer
              </span>
            )}
            {(human?.blockedSlots?.length ?? 0) > 0 && (
              <span
                title={`Blocked times: ${human.blockedSlots.join(", ")}`}
                className="inline-flex items-center text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider"
              >
                {human.blockedSlots.length} blocked {human.blockedSlots.length === 1 ? "time" : "times"}
              </span>
            )}
          </div>
          {isEditing ? (
            <>
              <div className="flex gap-2 mt-1">
                <input
                  ref={nameInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="First name"
                  aria-label="First name"
                  className="text-lg font-bold font-display text-brand-purple bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex-1 min-w-0 outline-none font-inherit focus:border-brand-teal"
                />
                <input
                  value={editSurname}
                  onChange={(e) => setEditSurname(e.target.value)}
                  placeholder="Surname"
                  aria-label="Surname"
                  className="text-lg font-bold font-display text-brand-purple bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex-1 min-w-0 outline-none font-inherit focus:border-brand-teal"
                />
              </div>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Phone"
                type="tel"
                aria-label="Phone"
                className="mt-2 text-[13px] bg-white border border-slate-200 rounded-md px-2.5 py-1 w-full max-w-[280px] box-border outline-none font-inherit text-slate-700 focus:border-brand-teal"
              />
            </>
          ) : (
            <>
              <h2
                id="human-card-title"
                className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1 truncate"
              >
                {titleCase(humanFullName) || "Unnamed human"}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 min-h-[20px] max-sm:min-h-[44px]">
                {human.phone ? (
                  <>
                    <a
                      href={telLink(human.phone)}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[13px] text-slate-500 font-semibold no-underline hover:text-brand-purple transition-colors whitespace-nowrap"
                    >
                      {human.phone}
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyPhone();
                      }}
                      aria-label={`Copy phone number ${human.phone}`}
                      title="Copy to clipboard"
                      className="w-6 h-6 max-sm:w-11 max-sm:h-11 shrink-0 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer text-slate-400 hover:text-brand-purple hover:bg-slate-100 transition-all"
                    >
                      <Copy size={12} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                    <a
                      href={telLink(human.phone)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Call ${human.phone}`}
                      title="Call"
                      className="w-6 h-6 max-sm:w-11 max-sm:h-11 shrink-0 rounded-md flex items-center justify-center bg-transparent text-slate-400 hover:text-brand-purple hover:bg-slate-100 transition-all no-underline"
                    >
                      <Phone size={12} strokeWidth={2.4} aria-hidden="true" />
                    </a>
                    {human.whatsapp && (
                      <a
                        href={waLink(human.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Message ${human.phone} on WhatsApp`}
                        title="Open in WhatsApp"
                        className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 max-sm:min-h-[44px] max-sm:px-3 rounded-md no-underline hover:bg-emerald-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        WA
                      </a>
                    )}
                  </>
                ) : (
                  <span className="text-[13px] text-slate-400 italic">No phone</span>
                )}
              </div>
              {isPendingSignup && claimedHuman && (
                <p className="mt-3 text-[13px] text-slate-600 leading-snug">
                  Says they&apos;re an existing customer:{" "}
                  <span className="font-bold text-brand-purple">{claimedName}</span>.
                  Linking moves this number and login onto that record.
                </p>
              )}
              {isPendingSignup && (
                <div className="flex items-center gap-2 mt-3">
                  {claimedHuman ? (
                    <button
                      type="button"
                      onClick={onLinkClaimedSignup}
                      disabled={signupBusy}
                      className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-full border-none text-[13px] font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Link2 size={14} strokeWidth={2.6} aria-hidden="true" />
                      {signupBusy ? "Linking…" : `Link to ${claimedName}`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onApproveSignup}
                      disabled={signupBusy}
                      className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-full border-none text-[13px] font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                      {signupBusy ? "Approving…" : "Approve"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onRejectSignup}
                    disabled={signupBusy}
                    className="inline-flex items-center py-1.5 px-3.5 rounded-full border-[1.5px] border-brand-coral/40 bg-white text-brand-coral-text text-[13px] font-bold font-inherit cursor-pointer transition-colors hover:bg-brand-coral-light disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reject…
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!isEditing && canEdit && (
          <HeaderIconButton
            label="Edit profile"
            title="Edit profile (press E)"
            onClick={onStartEdit}
          >
            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        )}
        <OverflowMenu items={overflowItems} />
        <HeaderIconButton label="Close" onClick={onClose}>
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </HeaderIconButton>
      </div>
    </header>
  );
}
