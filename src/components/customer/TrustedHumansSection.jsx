import { useState } from "react";
import { cardAnim } from "./dashboardConstants.js";
import { Pencil, Plus, Users, X } from "lucide-react";
import { validateContactPhone, formatPhoneForDisplay } from "../../utils/phone.js";
import { titleCase } from "../../utils/text";
import { Input } from "../ui/index.js";

const AVATAR_PALETTE = ["sky", "buttercup", "mint", "coral"];
function avatarTintFor(id) {
  if (!id) return AVATAR_PALETTE[1];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Matches the cap save_customer_trusted_contact enforces. */
export const MAX_CUSTOMER_CONTACTS = 6;

const SAVE_ERRORS = {
  name_required: "Please add their first name.",
  name_too_long: "That name is too long.",
  relationship_too_long: "Keep the relationship short, like “Mum” or “Dog walker”.",
  phone_required: "Please add their phone number.",
  invalid_mobile:
    "That looks like a UK mobile but the digits don't add up. Check for a missing or extra digit (it should be 11, e.g. 07700 900123).",
  invalid_phone: "Please enter a valid phone number (at least 10 digits).",
  too_many_contacts: `You can add up to ${MAX_CUSTOMER_CONTACTS} trusted humans.`,
  contact_not_found: "We couldn't find that person on your account. Refresh and try again.",
};

function friendlySaveError(error) {
  const message = error?.message || "";
  const key = Object.keys(SAVE_ERRORS).find((code) => message.includes(code));
  return key ? SAVE_ERRORS[key] : "We couldn't save that just now. Please try again.";
}

const fullNameOf = (person) => `${person.name || ""} ${person.surname || ""}`.trim();

function PersonRow({ person, note, onEdit }) {
  const name = titleCase(fullNameOf(person)) || "Unnamed";
  return (
    <div className="portal-entity-row">
      <span className={`portal-avatar portal-avatar--${avatarTintFor(person.id)}`} aria-hidden="true">
        {(person.name || "?").trim().charAt(0).toUpperCase()}
      </span>
      <div className="portal-entity-row-body">
        <p className="portal-entity-row-name">{name}</p>
        {person.relationship && <p className="portal-entity-row-meta">{person.relationship}</p>}
        {person.phone && (
          <a
            href={`tel:${person.phone.replace(/\s/g, "")}`}
            className="portal-entity-row-meta hover:underline"
            style={{ display: "block" }}
          >
            {formatPhoneForDisplay(person.phone) || person.phone}
          </a>
        )}
        {note && <p className="portal-entity-row-meta">{note}</p>}
      </div>
      {onEdit && (
        <button
          type="button"
          className="portal-btn portal-btn--ghost portal-btn--small"
          onClick={onEdit}
          aria-label={`Edit ${name}`}
        >
          <Pencil size={12} aria-hidden="true" />
          Edit
        </button>
      )}
    </div>
  );
}

function ContactForm({ initial, dogName, onSave, onRemove, onDone }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    surname: initial?.surname || "",
    phone: initial?.phone || "",
    relationship: initial?.relationship || "",
  });
  const [busy, setBusy] = useState(null); // "saving" | "removing" | null
  const [error, setError] = useState(null);
  const isNew = !initial;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(SAVE_ERRORS.name_required);
      return;
    }
    // The same rule staff use, so a number is held to one standard whoever
    // types it; the database checks it again.
    const { value: phone, error: phoneError } = validateContactPhone(form.phone);
    if (phoneError || !phone) {
      setError(phoneError || SAVE_ERRORS.phone_required);
      return;
    }
    setBusy("saving");
    const { error: saveError } = await onSave({
      id: initial?.id ?? null,
      name: form.name.trim(),
      surname: form.surname.trim(),
      phone,
      relationship: form.relationship.trim(),
    });
    setBusy(null);
    if (saveError) {
      setError(friendlySaveError(saveError));
      return;
    }
    onDone(isNew ? "added" : "saved");
  };

  const handleRemove = async () => {
    setError(null);
    setBusy("removing");
    const { error: removeError } = await onRemove(initial.id);
    setBusy(null);
    if (removeError) {
      setError("We couldn't remove them just now. Please try again.");
      return;
    }
    onDone("removed");
  };

  return (
    <form
      className="portal-inline-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label={isNew ? "Add a trusted human" : `Edit ${fullNameOf(initial)}`}
    >
      <div className="portal-inline-form-row">
        <Input
          aria-label="First name"
          autoComplete="off"
          placeholder="First name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          surface="paper" size="portal"
        />
        <Input
          aria-label="Surname"
          autoComplete="off"
          placeholder="Surname"
          value={form.surname}
          onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))}
          surface="paper" size="portal"
        />
      </div>
      <Input
        type="tel"
        inputMode="tel"
        aria-label="Phone number"
        autoComplete="off"
        placeholder="Phone number"
        value={form.phone}
        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        surface="paper" size="portal"
      />
      <Input
        aria-label="Relationship"
        autoComplete="off"
        placeholder="Relationship (e.g. Mum)"
        maxLength={40}
        value={form.relationship}
        onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
        surface="paper" size="portal"
      />
      {isNew && (
        <p className="portal-text-help" style={{ margin: 0 }}>
          They&apos;ll be able to drop off and collect {dogName}. Please let them know you&apos;ve
          shared their details with us.
        </p>
      )}
      {error && <div role="alert" className="portal-inline-error">{error}</div>}
      <div className="portal-inline-form-actions">
        <button type="submit" className="portal-btn portal-btn--primary portal-btn--small" disabled={busy !== null}>
          {busy === "saving" ? "Saving…" : isNew ? "Add" : "Save"}
        </button>
        <button type="button" className="portal-btn portal-btn--ghost portal-btn--small" onClick={() => onDone(null)} disabled={busy !== null}>
          <X size={14} aria-hidden="true" />
          Cancel
        </button>
        {!isNew && onRemove && (
          <button
            type="button"
            className="portal-btn portal-btn--ghost portal-btn--small portal-btn--danger-text"
            onClick={handleRemove}
            disabled={busy !== null}
          >
            {busy === "removing" ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
    </form>
  );
}

// `status` is this card's own read: "loading" | "loaded" | "error". The list
// is only meaningful once it is "loaded" — before that, or after a failure,
// an empty card would tell someone with trusted humans that they have none.
//
// Two kinds of trusted human appear here: people the salon linked (shown
// read-only, as before) and people the customer added themselves, which they
// can edit and remove. A customer-added person is trusted as soon as they are
// saved. Adding never looks anyone up against existing customers.
export function TrustedHumansSection({
  trustedHumans,
  customerContacts = [],
  status = "loaded",
  onRetry,
  onSave,
  onRemove,
  onChanged,
  dogName = "your dog",
}) {
  return (
    <div
      className="portal-card"
      style={cardAnim(0.15)}
      aria-busy={status === "loading" || undefined}
    >
      <div className="portal-card-header">
        <span className="portal-card-iconbadge portal-card-iconbadge--buttercup">
          <Users size={18} aria-hidden="true" />
        </span>
        <h2 className="portal-card-title">Trusted humans</h2>
      </div>

      {status === "loaded" ? (
        <TrustedHumansList
          trustedHumans={trustedHumans}
          customerContacts={customerContacts}
          onSave={onSave}
          onRemove={onRemove}
          onChanged={onChanged}
          dogName={dogName}
        />
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          {status === "loading" ? (
            <p className="portal-empty-body">Just fetching your trusted humans…</p>
          ) : (
            <>
              <p className="portal-empty-body">
                We couldn&apos;t load your trusted humans just now.
              </p>
              <button
                type="button"
                className="portal-btn portal-btn--secondary"
                style={{ marginTop: 12 }}
                onClick={onRetry}
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TrustedHumansList({ trustedHumans, customerContacts, onSave, onRemove, onChanged, dogName }) {
  // null | "new" | a customer contact id
  const [editing, setEditing] = useState(null);
  const canManage = Boolean(onSave);
  const isEmpty = trustedHumans.length === 0 && customerContacts.length === 0;
  const canAdd = canManage && customerContacts.length < MAX_CUSTOMER_CONTACTS;

  const done = (outcome) => {
    setEditing(null);
    if (outcome) onChanged?.(outcome);
  };

  return (
    <>
      <div className={`flex-1${isEmpty && editing !== "new" ? " flex flex-col justify-center" : ""}`}>
        {trustedHumans.map((person) => (
          <PersonRow key={`salon-${person.id}`} person={person} note="Added by the salon" />
        ))}

        {customerContacts.map((person) =>
          editing === person.id ? (
            <ContactForm
              key={person.id}
              initial={person}
              dogName={dogName}
              onSave={onSave}
              onRemove={onRemove}
              onDone={done}
            />
          ) : (
            <PersonRow
              key={person.id}
              person={person}
              onEdit={canManage && editing === null ? () => setEditing(person.id) : undefined}
            />
          ),
        )}

        {isEmpty && editing !== "new" && (
          <p className="portal-empty-body" style={{ marginTop: 0 }}>
            Add someone who can drop off or collect {dogName}.
          </p>
        )}

        {editing === "new" && (
          <div className="mt-3">
            <ContactForm dogName={dogName} onSave={onSave} onDone={done} />
          </div>
        )}
      </div>

      {canAdd && editing === null && (
        <div className="portal-card-bottom-action">
          <button
            type="button"
            className="portal-btn portal-btn--secondary w-full"
            onClick={() => setEditing("new")}
          >
            <Plus size={14} aria-hidden="true" />
            Add a trusted human
          </button>
        </div>
      )}
    </>
  );
}
