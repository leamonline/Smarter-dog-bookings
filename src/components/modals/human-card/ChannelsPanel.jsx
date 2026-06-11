import { useState } from "react";
import { Radio, MessageSquare, MessageCircle } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";

// Single wrapping pill row for the five channels. SMS + WhatsApp are
// always click-to-toggle (live in view mode via onUpdateHuman; staged in
// edit mode via setEditX) with a 200ms scale-tick to confirm the save.
// FB / IG / TT pills only reflect handle presence; the handles are
// edited via inputs that appear under the pills in edit mode.

function Pill({ label, icon, active, activeClass, onClick, ariaLabel, title, saving }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={ariaLabel || label}
      aria-pressed={onClick ? active : undefined}
      title={title}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold font-inherit border-none transition-[background-color,color,transform] duration-200",
        onClick ? "cursor-pointer" : "cursor-default",
        active ? activeClass : "bg-slate-100 text-slate-500",
        saving ? "scale-110" : "scale-100",
      ].join(" ")}
    >
      {Icon && <Icon size={12} strokeWidth={2.4} aria-hidden="true" />}
      {label}
    </button>
  );
}

function HandleInput({ caption, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
        {caption}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={caption}
        className="mt-1 w-full py-1.5 px-2.5 rounded-control border border-slate-200 text-sm font-semibold font-inherit outline-none text-brand-purple bg-white focus:border-brand-teal transition-colors"
      />
    </label>
  );
}

export function ChannelsPanel({
  isEditing,
  human,
  onUpdateHuman,
  editSms,
  setEditSms,
  editWhatsapp,
  setEditWhatsapp,
  editFb,
  setEditFb,
  editInsta,
  setEditInsta,
  editTiktok,
  setEditTiktok,
}) {
  const smsActive = isEditing ? editSms : !!human.sms;
  const waActive = isEditing ? editWhatsapp : !!human.whatsapp;
  const fbHandle = isEditing ? editFb : human.fb;
  const igHandle = isEditing ? editInsta : human.insta;
  const ttHandle = isEditing ? editTiktok : human.tiktok;

  const [savingPill, setSavingPill] = useState(null);

  const flashSaved = (key) => {
    setSavingPill(key);
    setTimeout(() => {
      setSavingPill((current) => (current === key ? null : current));
    }, 200);
  };

  const toggleSms = () => {
    const next = !smsActive;
    if (isEditing) {
      setEditSms(next);
      return;
    }
    if (!onUpdateHuman || !human.id) return;
    flashSaved("sms");
    onUpdateHuman(human.id, { sms: next });
  };

  const toggleWa = () => {
    const next = !waActive;
    if (isEditing) {
      setEditWhatsapp(next);
      return;
    }
    if (!onUpdateHuman || !human.id) return;
    flashSaved("whatsapp");
    onUpdateHuman(human.id, { whatsapp: next });
  };

  const liveToggleAvailable = !!onUpdateHuman && !!human.id;
  const smsHandler = isEditing || liveToggleAvailable ? toggleSms : undefined;
  const waHandler = isEditing || liveToggleAvailable ? toggleWa : undefined;

  return (
    <PanelShell eyebrow="Channels" icon={Radio} accent="teal">
      <div className="flex flex-wrap gap-1.5">
        <Pill
          label="SMS"
          icon={MessageSquare}
          active={smsActive}
          activeClass="bg-brand-teal text-white"
          onClick={smsHandler}
          saving={savingPill === "sms"}
          ariaLabel={`SMS reminders ${smsActive ? "active" : "off"}`}
          title={smsHandler ? `Toggle SMS ${smsActive ? "off" : "on"}` : undefined}
        />
        <Pill
          label="WhatsApp"
          icon={MessageCircle}
          active={waActive}
          activeClass="bg-emerald-500 text-white"
          onClick={waHandler}
          saving={savingPill === "whatsapp"}
          ariaLabel={`WhatsApp reminders ${waActive ? "active" : "off"}`}
          title={waHandler ? `Toggle WhatsApp ${waActive ? "off" : "on"}` : undefined}
        />
        <Pill
          label="Facebook"
          active={!!fbHandle}
          activeClass="bg-sky-100 text-sky-700"
          ariaLabel={fbHandle ? `Facebook handle ${fbHandle}` : "Facebook handle not on file"}
          title={fbHandle || undefined}
        />
        <Pill
          label="Instagram"
          active={!!igHandle}
          activeClass="bg-pink-100 text-pink-700"
          ariaLabel={igHandle ? `Instagram handle ${igHandle}` : "Instagram handle not on file"}
          title={igHandle || undefined}
        />
        <Pill
          label="TikTok"
          active={!!ttHandle}
          activeClass="bg-slate-800 text-white"
          ariaLabel={ttHandle ? `TikTok handle ${ttHandle}` : "TikTok handle not on file"}
          title={ttHandle || undefined}
        />
      </div>

      {isEditing && (
        <div className="mt-3 flex flex-col gap-2.5 pt-3 border-t border-slate-100">
          <HandleInput
            caption="Facebook"
            value={editFb}
            onChange={setEditFb}
            placeholder="@handle or URL"
          />
          <HandleInput
            caption="Instagram"
            value={editInsta}
            onChange={setEditInsta}
            placeholder="@handle"
          />
          <HandleInput
            caption="TikTok"
            value={editTiktok}
            onChange={setEditTiktok}
            placeholder="@handle"
          />
        </div>
      )}
    </PanelShell>
  );
}
