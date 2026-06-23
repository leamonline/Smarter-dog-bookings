// ============================================================
// src/components/views/inbox/thread/TemplatePicker.jsx
//
// Template picker shown in ComposePanel when the 24h free-form text
// window is closed. Collapsed by default to a one-line banner + a
// "Select a template…" dropdown; the fields, preview and Send button
// only appear once a template is chosen. Sends via whatsapp-send
// (mode:"template").
// ============================================================

import { useEffect, useState } from "react";
import { WHATSAPP_PICKER_TEMPLATES } from "../../../../constants/whatsappTemplates.js";

// Accepts EITHER a conversation (existing-thread reply, the 24h-window
// reopen flow) OR a customerFirstName + contextKey directly (outbound
// compose-new flow, where there isn't a conversation row yet). Both
// paths render the same form; only the auto-fill source differs.
export function TemplatePicker({ conversation, dogNames, onSend, customerFirstName, contextKey }) {
  // Start with NOTHING selected so the picker stays collapsed until staff
  // choose a template.
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [paramValues, setParamValues] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const template =
    WHATSAPP_PICKER_TEMPLATES.find((t) => t.name === selectedTemplateName) ?? null;

  // Auto-fill known params from conversation context whenever the
  // selected template or context changes. contextKey lets the
  // outbound compose-new flow tell us "this is a different customer
  // now" without faking a conversation.id.
  const resolvedFirstName =
    customerFirstName ?? conversation?.humans?.name ?? "";
  const resolvedContextKey = contextKey ?? conversation?.id ?? "";
  useEffect(() => {
    if (!template) {
      setParamValues({});
      return;
    }
    const autoFilled = {};
    const firstDog = (dogNames ?? [])[0] ?? "";
    for (const param of template.params) {
      if (param.autoFill === "customer_first_name") autoFilled[param.key] = resolvedFirstName;
      else if (param.autoFill === "dog_name_select") autoFilled[param.key] = firstDog;
    }
    setParamValues(autoFilled);
    setSent(false);
    setError(null);
  }, [selectedTemplateName, resolvedContextKey, resolvedFirstName, dogNames, template]);

  if (WHATSAPP_PICKER_TEMPLATES.length === 0) {
    return (
      <div className="p-3 text-sm text-rose-700 bg-rose-50 rounded-lg border border-rose-200">
        No approved WhatsApp templates are available.
      </div>
    );
  }

  if (sent) {
    return (
      <div className="p-3 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
        ✓ Template sent. The customer will receive the message shortly.
      </div>
    );
  }

  const allFilled =
    template?.params.every((p) => (paramValues[p.key] ?? "").trim() !== "") ?? false;
  const preview = template ? template.preview(paramValues) : "";
  // Which params are still missing — used for the disabled Send button's hint.
  const missingLabels = template
    ? template.params
        .filter((p) => (paramValues[p.key] ?? "").trim() === "")
        .map((p) => p.label.replace(/\s*\(.+\)\s*$/, "").toLowerCase())
    : [];

  async function handleSend() {
    if (!template) return;
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

  return (
    <div className="flex flex-col gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-[11px] leading-snug text-amber-900">
        <span aria-hidden="true">⏱ </span>
        <span className="font-bold">24-hour reply window closed.</span>{" "}
        <span className="text-amber-800">Send a template to reopen the chat.</span>
      </p>

      <div className="flex items-center gap-2">
        <select
          id="wa-template-select"
          aria-label="Template"
          title={template?.description}
          className="flex-1 min-w-0 text-[13px] h-8 border border-slate-300 rounded-lg px-2 bg-white focus:outline-none focus:border-brand-yellow"
          value={selectedTemplateName}
          onChange={(e) => setSelectedTemplateName(e.target.value)}
        >
          <option value="">Select a template…</option>
          {WHATSAPP_PICKER_TEMPLATES.map((t) => (
            <option key={t.name} value={t.name}>{t.label}</option>
          ))}
        </select>
        {template && (
          <button
            onClick={handleSend}
            disabled={!allFilled || sending}
            aria-label={
              !allFilled
                ? `Send template (disabled — missing ${missingLabels.join(", ")})`
                : "Send template"
            }
            title={!allFilled ? `Fill in ${missingLabels.join(", ")}` : "Send template"}
            className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full bg-brand-yellow text-brand-purple text-[12px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-yellow-dark transition-colors font-[inherit]"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        )}
      </div>

      {template && (
        <>
          {template.params.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {template.params.map((param) => {
                const fieldId = `wa-template-${param.key}`;
                const isDogSelect =
                  param.autoFill === "dog_name_select" && (dogNames ?? []).length > 1;
                return (
                  <label
                    key={param.key}
                    htmlFor={fieldId}
                    className={`flex flex-col gap-0.5 min-w-0 ${param.autoFill ? "" : "col-span-2"}`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {param.label.replace(/\s*\(.+\)\s*$/, "")}
                    </span>
                    {isDogSelect ? (
                      <select
                        id={fieldId}
                        className="w-full text-[13px] h-8 border border-slate-300 rounded-lg px-2 bg-white focus:outline-none focus:border-brand-yellow"
                        value={paramValues[param.key] ?? ""}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
                      >
                        <option value="">Select a dog…</option>
                        {dogNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={fieldId}
                        type="text"
                        className="w-full text-[13px] h-8 border border-slate-300 rounded-lg px-2 focus:outline-none focus:border-brand-yellow"
                        value={paramValues[param.key] ?? ""}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
                        placeholder={param.label.replace(/\s*\(.+\)\s*$/, "")}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          )}

          <div
            aria-label="Template preview"
            className="text-[12px] leading-snug text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap"
          >
            {preview}
          </div>

          {error && <p className="text-[11px] text-red-700">{error}</p>}
        </>
      )}
    </div>
  );
}
