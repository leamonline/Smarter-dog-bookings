// Editable email reminder composer. Pre-filled subject + plain-text
// body from the email template; staff can edit, then one-click send via
// reminder-send -> SendGrid (server-side). On success the reminder is
// logged to the customer's inbox thread.

import { useState } from "react";
import { renderEmailReminder } from "../../../lib/reminders/templates.js";

export function EmailComposer({ firstName, dogNames, date, slot, service, emailTo, onSend, sending }) {
  const initial = renderEmailReminder({ firstName, dogNames, date, slot, service });
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const ready = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 p-3 bg-violet-50 border border-violet-200 rounded-lg">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5 text-violet-700">✉️</span>
        <div className="text-[12px] leading-snug text-violet-900">
          <p className="font-bold m-0">Email via Smarter Dog Grooming</p>
          <p className="text-violet-800 m-0">Sends from the salon inbox and is logged to this customer's thread.</p>
        </div>
      </div>

      <label className="text-[11px] font-semibold text-violet-900">
        To <span className="font-normal text-violet-700">{emailTo}</span>
      </label>

      <label htmlFor="reminder-email-subject" className="text-[11px] font-semibold text-violet-900">
        Subject
      </label>
      <input
        id="reminder-email-subject"
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full text-[14px] px-2 py-1.5 bg-white border border-violet-300 rounded-lg font-[inherit]"
      />

      <label htmlFor="reminder-email-body" className="text-[11px] font-semibold text-violet-900">
        Message
      </label>
      <textarea
        id="reminder-email-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        className="w-full text-[14px] p-2 bg-white border border-violet-300 rounded-lg font-[inherit] resize-y"
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSend({ channel: "email", email: { subject: subject.trim(), body: body.trim() } })}
          disabled={!ready || sending}
          className="inline-flex items-center h-9 px-4 rounded-full bg-violet-600 text-white text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-700 transition-colors font-[inherit]"
        >
          {sending ? "Sending…" : "Send email"}
        </button>
      </div>
    </div>
  );
}
