// Editable SMS reminder composer with a live GSM-7/UCS-2 segment
// counter. Pre-filled with a single-segment template; staff can edit.
// Sends via reminder-send -> sms-send (Twilio).

import { useState } from "react";
import { renderSmsReminder } from "../../../lib/reminders/templates.js";
import { smsSegmentInfo } from "../../../lib/sms/segments.js";

export function SmsComposer({ firstName, dogNames, date, slot, service, phoneDisplay, onSend, sending }) {
  const [text, setText] = useState(() =>
    renderSmsReminder({ firstName, dogNames, date, slot, service }),
  );
  const info = smsSegmentInfo(text);
  const overOneSegment = info.segments > 1;
  const hasText = text.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 p-3 bg-sky-50 border border-sky-200 rounded-lg">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5 text-sky-700">📱</span>
        <div className="text-[12px] leading-snug text-sky-900">
          <p className="font-bold m-0">SMS via Twilio</p>
          <p className="text-sky-800 m-0">
            Plain text only. Keep it to one segment where you can — longer messages
            split and are billed per segment.
          </p>
        </div>
      </div>

      <label className="text-[11px] font-semibold text-sky-900">
        To <span className="font-normal text-sky-700 tabular-nums">{phoneDisplay}</span>
      </label>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={2000}
        aria-label="SMS message body"
        className="w-full text-[14px] p-2 bg-white border border-sky-300 rounded-lg font-[inherit] resize-y"
      />

      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
        <span className={`tabular-nums ${overOneSegment ? "text-amber-700 font-semibold" : "text-sky-900"}`}>
          {info.length} char{info.length === 1 ? "" : "s"} · {info.segments} segment
          {info.segments === 1 ? "" : "s"} · {info.encoding}
          {overOneSegment ? " — over 1 segment" : ""}
        </span>
        <button
          type="button"
          onClick={() => onSend({ channel: "sms", sms: { text: text.trim() } })}
          disabled={!hasText || sending}
          className="inline-flex items-center h-9 px-4 rounded-full bg-sky-600 text-white text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sky-700 transition-colors font-[inherit]"
        >
          {sending ? "Sending…" : "Send SMS"}
        </button>
      </div>
    </div>
  );
}
