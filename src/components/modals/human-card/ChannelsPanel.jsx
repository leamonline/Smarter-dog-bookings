import { Radio, MessageSquare, MessageCircle } from "lucide-react";
import { PanelShell } from "./PanelShell.jsx";

// Horizontal pill chips for the five contact channels — replaces the
// "SMS … ✅ Active" / "Facebook … —" rows that read as a settings dialog.
// Filled = active (teal for SMS/WA, emerald for social handle present),
// ghosted slate = inactive. Edit mode flips SMS + WhatsApp to
// click-to-toggle and shows text inputs for the social handles below.

function Pill({ label, icon, active, activeClass, onClick, ariaLabel, title }) {
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
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold font-inherit transition-colors border-none",
        onClick ? "cursor-pointer" : "cursor-default",
        active
          ? activeClass
          : "bg-slate-100 text-slate-400",
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

  return (
    <PanelShell eyebrow="Channels" icon={Radio} accent="teal">
      <div className="flex flex-wrap gap-1.5">
        <Pill
          label="SMS"
          icon={MessageSquare}
          active={smsActive}
          activeClass="bg-brand-teal text-white"
          onClick={isEditing ? () => setEditSms(!smsActive) : undefined}
          ariaLabel={`SMS reminders ${smsActive ? "active" : "off"}`}
          title={isEditing ? `Toggle SMS ${smsActive ? "off" : "on"}` : undefined}
        />
        <Pill
          label="WhatsApp"
          icon={MessageCircle}
          active={waActive}
          activeClass="bg-emerald-500 text-white"
          onClick={isEditing ? () => setEditWhatsapp(!waActive) : undefined}
          ariaLabel={`WhatsApp reminders ${waActive ? "active" : "off"}`}
          title={isEditing ? `Toggle WhatsApp ${waActive ? "off" : "on"}` : undefined}
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
