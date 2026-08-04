import { useState, useEffect } from "react";
import { Card, CardHead, CardBody, SaveButton, LABEL_CLS, INPUT_CLS, isValidEmail } from "./shared.jsx";

const NOOP_SAVE = async () => ({ ok: true });

function readBusiness(config) {
  return {
    name: config?.businessName || "",
    phone: config?.businessPhone || "",
    email: config?.businessEmail || "",
    address: config?.businessAddress || "",
  };
}

export function BusinessSettings({ config, onUpdateConfig = NOOP_SAVE, canEdit = true, onDirtyChange }) {
  const [business, setBusiness] = useState(() => readBusiness(config));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Stay in step with settings loaded/changed elsewhere as long as there's
  // nothing unsaved here to lose.
  useEffect(() => {
    if (!dirty) setBusiness(readBusiness(config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, config?.businessName, config?.businessPhone, config?.businessEmail, config?.businessAddress]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const update = (field) => (e) => {
    setBusiness((b) => ({ ...b, [field]: e.target.value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    if (business.email.trim() && !isValidEmail(business.email)) {
      setError("That email doesn't look right — please check and try again");
      return;
    }
    setSaving(true);
    setError("");
    const result = await onUpdateConfig((previous) => ({
      ...previous,
      businessName: business.name.trim(),
      businessPhone: business.phone.trim(),
      businessEmail: business.email.trim(),
      businessAddress: business.address.trim(),
    }));
    setSaving(false);
    if (result?.ok === false) {
      setError(result.error || "Couldn't save your changes — please try again");
      return;
    }
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card id="settings-business">
      <CardHead
        variant="teal"
        title="Your Business"
        desc="Shown on the public website and customer-facing pages"
      />
      <CardBody>
        <div className="mb-3">
          <label className={LABEL_CLS}>Salon Name</label>
          <input
            type="text"
            value={business.name}
            onChange={update("name")}
            disabled={!canEdit}
            placeholder="Smarter Dog Grooming"
            className={INPUT_CLS}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className={LABEL_CLS}>Phone (WhatsApp)</label>
            <input
              type="tel"
              value={business.phone}
              onChange={update("phone")}
              disabled={!canEdit}
              placeholder="07700 900123"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <input
              type="email"
              value={business.email}
              onChange={update("email")}
              disabled={!canEdit}
              placeholder="hello@smarterdog.co.uk"
              className={INPUT_CLS}
            />
          </div>
        </div>
        <div className="mb-3.5">
          <label className={LABEL_CLS}>Address</label>
          <input
            type="text"
            value={business.address}
            onChange={update("address")}
            disabled={!canEdit}
            placeholder="123 High Street, Exampletown"
            className={INPUT_CLS}
          />
        </div>
        {error && (
          <div role="alert" className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg mb-3">
            {error}
          </div>
        )}
        <SaveButton onClick={handleSave} saving={saving} saved={saved} disabled={!canEdit} />
      </CardBody>
    </Card>
  );
}
