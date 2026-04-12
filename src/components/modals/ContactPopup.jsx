import { useEffect } from "react";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ContactPopup({ human, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!human) return null;

  const fullName = titleCase(`${human.name} ${human.surname}`);

  const row = (label, value, active) => (
    <div className="flex justify-between items-center py-2 border-b border-slate-200">
      <span className="text-[13px] text-slate-500">{label}</span>
      {typeof active === "boolean" ? (
        <span className={`text-[13px] font-semibold ${active ? "text-brand-teal" : "text-brand-coral"}`}>
          {active ? "\u2705 On" : "\u274C Off"}
        </span>
      ) : (
        <span className="text-[13px] font-semibold text-slate-800">{value}</span>
      )}
    </div>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/25 flex items-center justify-center z-[1100]">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-[14px] w-[min(280px,90vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
        <div className="bg-gradient-to-br from-brand-teal to-[#236b5d] px-[18px] py-3.5 flex justify-between items-center">
          <div>
            <div className="text-[15px] font-bold text-white">{fullName}</div>
            <div className="text-xs text-white/80 mt-0.5">Contact preferences</div>
          </div>
          <button onClick={onClose} className="bg-white/20 border-none rounded-md w-6 h-6 flex items-center justify-center cursor-pointer text-xs text-white font-bold">{"\u00D7"}</button>
        </div>
        <div className="px-[18px] pt-2.5 pb-4">
          {row("Phone", human.phone)}
          {row("SMS", null, human.sms)}
          {row("WhatsApp", null, human.whatsapp)}
          {human.email ? (
            <div className="flex justify-between items-center py-2">
              <span className="text-[13px] text-slate-500">Email</span>
              <a href={`mailto:${human.email}`} className="text-[13px] font-semibold text-brand-teal no-underline hover:underline">{human.email}</a>
            </div>
          ) : row("Email", "\u2014")}
        </div>
      </div>
    </div>
  );
}
