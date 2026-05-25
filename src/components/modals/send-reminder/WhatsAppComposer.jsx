// Read-only WhatsApp reminder preview. Renders the populated, Meta-
// approved appointment_reminder_v1 template exactly as the customer
// will receive it, then sends it via the reminder-send edge function
// (which forwards to whatsapp-send -> Meta Cloud API).

import {
  getReminderTemplate,
  buildWhatsAppReminderParams,
  renderWhatsAppReminderPreview,
} from "../../../lib/reminders/templates.js";

export function WhatsAppComposer({ firstName, dogNames, date, slot, onSend, sending }) {
  const template = getReminderTemplate();
  const params = buildWhatsAppReminderParams({ firstName, dogNames, date, slot });
  const preview = renderWhatsAppReminderPreview({ firstName, dogNames, date, slot });

  return (
    <div className="flex flex-col gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5 text-emerald-700">💬</span>
        <div className="text-[12px] leading-snug text-emerald-900">
          <p className="font-bold m-0">Approved WhatsApp template</p>
          <p className="text-emerald-800 m-0">
            Sent via Meta as the <code>{template.name}</code> template. The wording is
            fixed by Meta — preview below is exactly what the customer receives.
          </p>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70 mb-1">
          Preview
        </div>
        {/* Chat-style read-only bubble */}
        <div className="flex justify-end">
          <div className="max-w-[85%] bg-[#dcf8c6] text-slate-800 rounded-2xl rounded-tr-sm px-3 py-2 text-[13px] whitespace-pre-wrap shadow-sm">
            {preview}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            onSend({
              channel: "whatsapp",
              whatsapp: { template_name: template.name, language: template.language, params },
            })
          }
          disabled={sending}
          className="inline-flex items-center h-9 px-4 rounded-full bg-emerald-600 text-white text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors font-[inherit]"
        >
          {sending ? "Sending…" : "Send WhatsApp"}
        </button>
      </div>
    </div>
  );
}
