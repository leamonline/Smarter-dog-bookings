import { AtSign } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";

// Social media handles: Facebook, Instagram, TikTok. The pills only reflect
// whether a handle is on file; the handles are edited via inputs that appear
// under the pills in edit mode. How a customer is CONTACTED (WhatsApp or SMS)
// lives in PreferredContactPanel, not here.

function Pill({ label, active, activeClass, ariaLabel, title }) {
  return (
    <span
      role="img"
      aria-label={ariaLabel || label}
      title={title}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-inherit",
        active ? activeClass : "bg-slate-100 text-slate-500",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function HandleInput({ caption, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-label text-ink-muted block">
        {caption}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={caption}
        className="mt-1 w-full py-1.5 px-2.5 rounded-control border border-slate-200 text-sm font-semibold font-inherit outline-none text-brand-ink bg-white focus:border-brand-teal transition-colors"
      />
    </label>
  );
}

export function SocialMediaPanel({
  isEditing,
  human,
  editFb,
  setEditFb,
  editInsta,
  setEditInsta,
  editTiktok,
  setEditTiktok,
}) {
  const fbHandle = isEditing ? editFb : human.fb;
  const igHandle = isEditing ? editInsta : human.insta;
  const ttHandle = isEditing ? editTiktok : human.tiktok;

  return (
    <PanelShell eyebrow="Social media" icon={AtSign} accent="teal">
      <div className="flex flex-wrap gap-1.5">
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
