// ============================================================
// src/components/views/inbox/thread/TemplatePicker.jsx
//
// Template picker shown in ComposePanel when the 24h free-form text
// window is closed. Lets staff pick a Meta-approved template, fill
// in any params, preview the message, then send it via whatsapp-send
// (mode:"template").
// ============================================================

import { useEffect, useState } from "react";
import { WHATSAPP_TEMPLATES } from "../../../../constants/whatsappTemplates.js";

// Hint shown under a template param when no value is on file. Keyed by
// the param's `autoFill` source so adding a new auto-fill source means
// adding one entry here rather than another ternary branch.
const TEMPLATE_PARAM_MISSING_HELPER = {
  customer_first_name: "No customer name on file yet — type one to send",
  dog_name_select: "No dog on file yet — type the name to send",
};

export function TemplatePicker({ conversation, dogNames, onSend }) {
  const [selectedTemplateName, setSelectedTemplateName] = useState(WHATSAPP_TEMPLATES[0].name);
  const [paramValues, setParamValues] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const template = WHATSAPP_TEMPLATES.find((t) => t.name === selectedTemplateName);

  // Auto-fill known params from conversation context whenever the selected
  // template or conversation changes.
  useEffect(() => {
    const autoFilled = {};
    const customerFirstName = conversation?.humans?.name ?? "";
    const firstDog = (dogNames ?? [])[0] ?? "";

    for (const param of template.params) {
      if (param.autoFill === "customer_first_name") autoFilled[param.key] = customerFirstName;
      else if (param.autoFill === "dog_name_select") autoFilled[param.key] = firstDog;
    }
    setParamValues(autoFilled);
    setSent(false);
    setError(null);
  }, [selectedTemplateName, conversation?.id, dogNames, template]);

  const allFilled = template.params.every((p) => (paramValues[p.key] ?? "").trim() !== "");
  const preview = template.preview(paramValues);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      await onSend(template, paramValues);
      setSent(true);
    } catch (err) {
      setError(err.message ?? "Failed to send template");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="p-3 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
        ✓ Template sent. The customer will receive the message shortly.
      </div>
    );
  }

  // Surface which params are still missing so the disabled Send button
  // has a concrete reason next to it. Labels come from the template
  // definition so the prompt matches the field's input above.
  const missingLabels = template.params
    .filter((p) => (paramValues[p.key] ?? "").trim() === "")
    .map((p) => p.label.replace(/\s*\(.+\)\s*$/, "").toLowerCase());

  return (
    <div className="flex flex-col gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5 text-amber-700">⏱</span>
        <div className="text-[12px] leading-snug text-amber-900">
          <p className="font-bold">24-hour reply window closed</p>
          <p className="text-amber-800">
            Meta only allows free-form WhatsApp replies within 24 hours of the
            customer&apos;s last message. Choose a Meta-approved template below
            to reopen the conversation — once they reply, you&apos;ll be back to
            free-form messaging.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="wa-template-select" className="block text-xs font-semibold text-slate-700 mb-1">
          Template
        </label>
        <select
          id="wa-template-select"
          className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-brand-yellow"
          value={selectedTemplateName}
          onChange={(e) => setSelectedTemplateName(e.target.value)}
        >
          {WHATSAPP_TEMPLATES.map((t) => (
            <option key={t.name} value={t.name}>{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-slate-600 mt-1">{template.description}</p>
      </div>

      {template.params.map((param) => {
        const fieldId = `wa-template-${param.key}`;
        const isAutoFilled =
          param.autoFill && (paramValues[param.key] ?? "").trim() !== "";
        const helper = isAutoFilled
          ? "Pre-filled — edit if needed"
          : (TEMPLATE_PARAM_MISSING_HELPER[param.autoFill] ?? null);
        if (param.autoFill === "dog_name_select" && (dogNames ?? []).length > 1) {
          return (
            <div key={param.key}>
              <label htmlFor={fieldId} className="block text-xs font-semibold text-slate-700 mb-1">
                {param.label}
              </label>
              <select
                id={fieldId}
                className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-brand-yellow"
                value={paramValues[param.key] ?? ""}
                onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
              >
                <option value="">Select a dog…</option>
                {dogNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pick from this customer&apos;s dogs
              </p>
            </div>
          );
        }
        return (
          <div key={param.key}>
            <label htmlFor={fieldId} className="block text-xs font-semibold text-slate-700 mb-1">
              {param.label}
            </label>
            <input
              id={fieldId}
              type="text"
              className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-yellow"
              value={paramValues[param.key] ?? ""}
              onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
              placeholder={`Enter ${param.label.toLowerCase()}…`}
            />
            {helper && (
              <p className="text-[11px] text-slate-500 mt-0.5">{helper}</p>
            )}
          </div>
        );
      })}

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
          Preview
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
          {preview}
        </div>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-slate-600 flex-1 min-w-[160px]">
          {allFilled
            ? "All set — sending will reopen the conversation."
            : `Fill in ${missingLabels.join(", ")} to enable sending.`}
        </p>
        <button
          onClick={handleSend}
          disabled={!allFilled || sending}
          aria-label={
            !allFilled
              ? `Send template (disabled — missing ${missingLabels.join(", ")})`
              : "Send template"
          }
          className="inline-flex items-center h-9 px-4 rounded-full bg-brand-yellow text-brand-purple text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-yellow-dark transition-colors font-[inherit]"
        >
          {sending ? "Sending…" : "Send template"}
        </button>
      </div>
    </div>
  );
}
