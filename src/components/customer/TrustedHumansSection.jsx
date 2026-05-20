import { useState, useCallback } from "react";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { addCustomerTrustedHuman } from "../../supabase/rpc";
import { cardAnim } from "./dashboardConstants.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { Users, Plus, X } from "lucide-react";

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

const AVATAR_PALETTE = ["sky", "buttercup", "mint", "coral"];
function avatarTintFor(id) {
  if (!id) return AVATAR_PALETTE[1];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function TrustedHumansSection({ trustedHumans, dogName = "your pup", onAdded }) {
  const toast = useToast();
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
    const { data, error: rpcErr } = await addCustomerTrustedHuman(supabase, {
      name: form.name,
      surname: form.surname,
      phone: form.phone,
      relationship: form.relationship,
    });
    setSaving(false);
    if (rpcErr) {
      setError(errorFromRpc(rpcErr));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && onAdded) onAdded(row);
    const trustedName = `${form.name || ""} ${form.surname || ""}`.trim();
    reset();
    toast.show(trustedName ? `${trustedName} added as a trusted human` : "Trusted human added", "success");
  }, [form, onAdded, reset, toast]);

  const isEmpty = trustedHumans.length === 0;

  return (
    <div className={`portal-card portal-card--buttercup${adding ? " portal-card--static" : ""}`} style={cardAnim(0.15)}>
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--buttercup">
          <Users size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">Trusted humans</h2>
      </div>

      <div className="flex-1">
        {isEmpty && !adding && (
          <p className="portal-empty-body" style={{ marginTop: 0, textAlign: "left", maxWidth: "none" }}>
            Add someone who&apos;s allowed to drop {dogName} off or pick {dogName === "your pup" ? "them" : "them"} up — a partner, family member, or friend.
          </p>
        )}

        {trustedHumans.map(th => {
          const initial = (th.name || "?").trim().charAt(0).toUpperCase();
          const tint = avatarTintFor(th.id);
          const fullName = `${th.name || ""} ${th.surname || ""}`.trim();
          return (
            <div key={th.id} className="portal-entity-row">
              <span className={`portal-avatar portal-avatar--${tint}`} aria-hidden="true">
                {initial}
              </span>
              <div className="portal-entity-row-body">
                <p className="portal-entity-row-name">{fullName}</p>
                {th.relationship && (
                  <p className="portal-entity-row-meta">{th.relationship}</p>
                )}
                {th.phone && (
                  <a
                    href={`tel:${th.phone.replace(/\s/g, "")}`}
                    className="portal-entity-row-meta hover:underline"
                    style={{ display: "block" }}
                  >
                    {th.phone}
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {adding && (
          <form className="portal-inline-form mt-3" onSubmit={handleSubmit} noValidate>
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
                {saving ? "Adding…" : "Add trusted human"}
              </button>
              <button type="button" className="portal-btn portal-btn--ghost portal-btn--small" onClick={reset}>
                <X size={14} aria-hidden="true" />
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {!adding && (
        <div className="portal-card-bottom-action">
          <button
            type="button"
            className="portal-btn portal-btn--secondary w-full"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} aria-hidden="true" />
            Add a trusted human
          </button>
        </div>
      )}
    </div>
  );
}
