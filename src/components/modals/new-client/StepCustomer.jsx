import { useState } from "react";
import { isRealPersonName } from "../../../utils/text";
import { Input, Textarea } from "../../ui/index.js";

const LABEL = "block text-[12px] font-bold text-brand-teal-text mb-1";

// Step 1 — customer details. Controlled by the wizard shell; phone format
// validation + the soft duplicate check happen in the shell on "Next".
export function StepCustomer({ human, onChange, duplicate, phoneError }) {
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="nc-name">First name *</label>
          <Input id="nc-name" value={human.name} placeholder="Amanda"
            onChange={(e) => onChange("name", e.target.value)} autoFocus />
          {/* Explains the disabled Next button: canAdvanceCustomer rejects
              placeholder names ("?", "-", "n/a"…) so no mystery customer can
              be created — say why instead of leaving a dead button. */}
          {human.name.trim() !== "" && !isRealPersonName(human.name) && (
            <div role="alert" className="text-[12px] text-brand-coral font-semibold mt-1">
              We need their real first name — {"“"}{human.name.trim()}{"”"} will be impossible to find later.
            </div>
          )}
        </div>
        <div>
          <label className={LABEL} htmlFor="nc-surname">Surname *</label>
          <Input id="nc-surname" value={human.surname} placeholder="Booth"
            onChange={(e) => onChange("surname", e.target.value)} />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="nc-phone">Phone *</label>
        <Input id="nc-phone" type="tel" value={human.phone} placeholder="07985 630521"
          onChange={(e) => onChange("phone", e.target.value)} />
        {phoneError && (
          <div role="alert" className="text-[12px] text-brand-coral font-semibold mt-1">{phoneError}</div>
        )}
      </div>

      {duplicate && (
        <div role="status" className="text-[12px] text-feedback-warning-ink bg-feedback-warning-tint border border-brand-mustard-tint rounded-lg px-3 py-2">
          A customer named <strong>{duplicate}</strong> already exists. Two people can share a name —
          tap <strong>Next</strong> again if this is someone new.
        </div>
      )}

      <button type="button" onClick={() => setShowMore((v) => !v)}
        className="self-start text-[12px] font-bold text-brand-teal hover:underline">
        {showMore ? "− Fewer details" : "+ More details (email, address, reminders)"}
      </button>

      {showMore && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={LABEL} htmlFor="nc-email">Email</label>
            <Input id="nc-email" type="email" value={human.email}
              onChange={(e) => onChange("email", e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className={LABEL} htmlFor="nc-address">Address</label>
            <Input id="nc-address" value={human.address}
              onChange={(e) => onChange("address", e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={human.sms} onChange={(e) => onChange("sms", e.target.checked)} />
              SMS reminders
            </label>
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={human.whatsapp} onChange={(e) => onChange("whatsapp", e.target.checked)} />
              WhatsApp
            </label>
          </div>
          <div>
            <label className={LABEL} htmlFor="nc-notes">Notes</label>
            <Textarea id="nc-notes" rows={2} value={human.notes}
              onChange={(e) => onChange("notes", e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
