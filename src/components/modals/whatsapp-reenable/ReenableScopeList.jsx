// Every switched-off customer record on the number, as the re-enable dialog
// shows it before staff confirm. Presentational only: the scope comes from
// useWhatsappNumberReenable, and all of it is switched back on together.
import { useId } from "react";
import { Button } from "../../ui/index.js";
import {
  optOutReasonLabel,
  optOutTimeLabel,
  recordDisplayName,
} from "../../../engine/whatsappReenable";
import { formatPhoneForDisplay } from "../../../utils/phone.js";

function ScopeRow({ record, isCurrent, onOpenProfile }) {
  const nameId = useId();
  const savedAs = formatPhoneForDisplay(record.phone);
  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span id={nameId} className="font-bold text-brand-purple truncate">
            {recordDisplayName(record)}
          </span>
          {isCurrent && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-teal-text bg-[#E6F5F2] px-1.5 py-0.5 rounded-md">
              This customer
            </span>
          )}
        </div>
        {savedAs && <div className="text-slate-600">Saved as {savedAs}</div>}
        <div className="text-slate-500">
          {optOutReasonLabel(record.reason)} · since {optOutTimeLabel(record.optedOutAt)}
        </div>
      </div>
      {onOpenProfile && !isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          aria-describedby={nameId}
          onClick={() => onOpenProfile(record.id)}
        >
          Open profile
        </Button>
      )}
    </li>
  );
}

export function ReenableScopeList({ scope, currentHumanId, onOpenProfile }) {
  const records = scope?.records ?? [];
  return (
    <div className="text-[12px] leading-snug">
      {records.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-2.5 mb-2.5">
          {records.map((record) => (
            <ScopeRow
              key={record.id}
              record={record}
              isCurrent={Boolean(currentHumanId) && record.id === currentHumanId}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </ul>
      )}
      <p className="m-0 text-slate-500">
        {records.length > 0
          ? "They’re all switched back on together — the number can’t be on for one record and off for another."
          : "No customer record uses this number. Only the WhatsApp chat is switched back on."}
      </p>
    </div>
  );
}
