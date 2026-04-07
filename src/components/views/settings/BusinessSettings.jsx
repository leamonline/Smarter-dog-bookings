import { useState } from "react";
import { Card, CardHead, CardBody, SaveButton, LABEL_CLS, INPUT_CLS } from "./shared.jsx";

export function BusinessSettings({ config, onUpdateConfig }) {
  const [business, setBusiness] = useState({
    name: config?.businessName || "Smarter Dog Grooming",
    phone: config?.businessPhone || "",
    email: config?.businessEmail || "",
    address: config?.businessAddress || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaving(true);
    onUpdateConfig((prev) => ({
      ...prev,
      businessName: business.name,
      businessPhone: business.phone,
      businessEmail: business.email,
      businessAddress: business.address,
    }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card id="settings-business">
      <CardHead variant="teal" title="Your Business" desc="Details shown to customers on the booking portal" />
      <CardBody>
        <div className="mb-3">
          <label className={LABEL_CLS}>Salon Name</label>
          <input
            type="text"
            value={business.name}
            onChange={(e) => setBusiness((b) => ({ ...b, name: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className={LABEL_CLS}>Phone</label>
            <input
              type="tel"
              value={business.phone}
              onChange={(e) => setBusiness((b) => ({ ...b, phone: e.target.value }))}
              className={INPUT_CLS}
              placeholder="07700 900123"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <input
              type="email"
              value={business.email}
              onChange={(e) => setBusiness((b) => ({ ...b, email: e.target.value }))}
              className={INPUT_CLS}
              placeholder="hello@smarterdog.co.uk"
            />
          </div>
        </div>
        <div className="mb-3.5">
          <label className={LABEL_CLS}>Address</label>
          <input
            type="text"
            value={business.address}
            onChange={(e) => setBusiness((b) => ({ ...b, address: e.target.value }))}
            className={INPUT_CLS}
            placeholder="123 High Street, Exampletown"
          />
        </div>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </CardBody>
    </Card>
  );
}
