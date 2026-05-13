import { useState, useCallback } from "react";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { cardAnim } from "./dashboardConstants.js";
import { Users, Plus, X, MessageCircle, Smartphone } from "lucide-react";

const ERR_LABEL = {
  not_authenticated: "You need to be signed in to add a trusted human.",
  no_linked_human: "We couldn't find your account record. Refresh and try again.",
  name_required: "First name is required.",
  phone_required: "A UK mobile number is required.",
  phone_invalid: "Please enter a UK mobile number, e.g. 07700 900123.",
  cannot_trust_self: "You can't add yourself as a trusted human.",
};

function errorFromRpc(err) {
  if (!err) return null;
  const msg = err?.message || "";
  const key = Object.keys(ERR_LABEL).find(k => msg.includes(k));
  return key ? ERR_LABEL[key] : "Something went wrong. Please try again.";
}

export function TrustedHumansSection({ trustedHumans, onAdded }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", surname: "", phone: "", relationship: "" });
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setForm({ name: "", surname: "", phone: "", relationship: "" });
    setError(null);
    setAdding(false);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("add_customer_trusted_human", {
      p_name: form.name,
      p_surname: form.surname,
      p_phone: form.phone,
      p_relationship: form.relationship,
    });
    setSaving(false);
    if (rpcErr) {
      setError(errorFromRpc(rpcErr));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && onAdded) onAdded(row);
    reset();
  }, [form, onAdded, reset]);

  return (
    <div className="portal-card portal-card--buttercup" style={cardAnim(0.15)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--buttercup">
          <Users size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">Trusted humans</h2>
        {!adding && (
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-btn--small portal-card-action"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} aria-hidden="true" />
            Add
          </button>
        )}
      </div>

      {trustedHumans.length === 0 && !adding && (
        <p className="portal-empty-body" style={{ marginTop: 0 }}>
          People you trust to drop off or pick up your dog.
        </p>
      )}

      {trustedHumans.map(th => (
        <div key={th.id} className="py-2.5 border-b border-[rgba(45,0,75,0.07)] last:border-b-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-bold text-brand-purple font-display">{th.name} {th.surname}</div>
            {th.relationship ? (
              <div className="text-xs text-slate-500 italic shrink-0">{th.relationship}</div>
            ) : null}
          </div>
          {th.phone ? (
            <a
              href={`tel:${th.phone.replace(/\s/g, "")}`}
              className="text-xs text-slate-500 font-medium no-underline hover:underline"
            >
              {th.phone}
            </a>
          ) : null}
        </div>
      ))}

      {adding && (
        <form className="portal-inline-form" onSubmit={handleSubmit} noValidate>
          <div className="portal-inline-form-row">
            <input
              required
              aria-label="First name"
              placeholder="First name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="portal-input"
            />
            <input
              aria-label="Surname"
              placeholder="Surname"
              value={form.surname}
              onChange={e => setForm(f => ({ ...f, surname: e.target.value }))}
              className="portal-input"
            />
          </div>
          <input
            required
            type="tel"
            inputMode="tel"
            aria-label="Mobile number"
            placeholder="07700 900123"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="portal-input"
          />
          <input
            aria-label="Relationship"
            placeholder="Relationship (e.g. partner, mum)"
            value={form.relationship}
            onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
            className="portal-input"
          />
          {error && (
            <div role="alert" className="portal-inline-error">{error}</div>
          )}
          <div className="portal-inline-form-actions">
            <button type="submit" className="portal-btn portal-btn--primary portal-btn--small" disabled={saving}>
              {saving ? "Adding..." : "Add trusted human"}
            </button>
            <button type="button" className="portal-btn portal-btn--ghost portal-btn--small" onClick={reset}>
              <X size={14} aria-hidden="true" />
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="portal-card-footer-actions">
        <a
          href="https://wa.me/447507731487"
          target="_blank"
          rel="noopener noreferrer"
          className="portal-btn portal-btn--whatsapp portal-btn--small"
        >
          <MessageCircle size={14} aria-hidden="true" />
          WhatsApp us
        </a>
        <a
          href="sms:07507731487"
          className="portal-btn portal-btn--phone portal-btn--small"
        >
          <Smartphone size={14} aria-hidden="true" />
          Text 07507 731487
        </a>
      </div>
    </div>
  );
}
