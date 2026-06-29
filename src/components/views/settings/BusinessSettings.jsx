import { useState, useEffect } from "react";
import { Card, CardHead, CardBody, SaveButton, LABEL_CLS, INPUT_CLS, isValidEmail } from "./shared.jsx";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { DEFAULT_BUSINESS_NAME } from "../../../constants/index";

export function BusinessSettings({ config, onUpdateConfig, canEdit = true, onDirtyChange }) {
  const toast = useToast();
  // Track whether the salon has actively configured its details so we
  // can warn that customers are seeing the default placeholders rather
  // than real values. The default name doubles as a placeholder; phone,
  // email and address have no defaults.
  const isUnconfigured =
    !config?.businessPhone &&
    !config?.businessEmail &&
    !config?.businessAddress &&
    (!config?.businessName || config?.businessName === DEFAULT_BUSINESS_NAME);

  const initial = {
    name: config?.businessName || DEFAULT_BUSINESS_NAME,
    phone: config?.businessPhone || "",
    email: config?.businessEmail || "",
    address: config?.businessAddress || "",
  };
  const [business, setBusiness] = useState(initial);
  // Last-saved values — `dirty` compares against this (not props) so it stays
  // correct even if the config prop doesn't re-flow after a save.
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [emailError, setEmailError] = useState("");

  const dirty =
    business.name !== baseline.name ||
    business.phone !== baseline.phone ||
    business.email !== baseline.email ||
    business.address !== baseline.address;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const handleSave = async () => {
    if (!canEdit) return;
    if (business.email.trim() && !isValidEmail(business.email)) {
      setEmailError("That email doesn't look right — please check and try again");
      return;
    }
    setEmailError("");
    setSaving(true);
    const result = await onUpdateConfig((prev) => ({
      ...prev,
      businessName: business.name,
      businessPhone: business.phone,
      businessEmail: business.email,
      businessAddress: business.address,
    }));
    setSaving(false);
    if (result?.ok === false) {
      toast.show(result.error || "Couldn't save that — give it another go?", "error");
      return;
    }
    setBaseline(business);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card id="settings-business">
      <CardHead variant="teal" title="Your Business" desc="Details shown to customers on the booking portal" />
      <CardBody>
        {isUnconfigured && (
          <div
            role="status"
            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-[12px] font-medium px-3 py-2"
          >
            <strong className="font-bold">Your salon isn't set up yet</strong> —
            customers will see placeholders. Fill in the fields below
            and tap Save.
          </div>
        )}
        <div className="mb-3">
          <label className={LABEL_CLS}>Salon Name</label>
          <input
            type="text"
            disabled={!canEdit}
            value={business.name}
            onChange={(e) => setBusiness((b) => ({ ...b, name: e.target.value }))}
            className={`${INPUT_CLS} ${
              business.name === DEFAULT_BUSINESS_NAME ? "italic text-slate-500/60" : ""
            }`}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className={LABEL_CLS}>Phone</label>
            <input
              type="tel"
              disabled={!canEdit}
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
              disabled={!canEdit}
              value={business.email}
              onChange={(e) => {
                setBusiness((b) => ({ ...b, email: e.target.value }));
                if (emailError) setEmailError("");
              }}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "business-email-error" : undefined}
              className={`${INPUT_CLS} ${emailError ? "!border-brand-coral" : ""}`}
              placeholder="hello@smarterdog.co.uk"
            />
            {emailError && (
              <div id="business-email-error" role="alert" className="text-xs text-brand-coral font-semibold mt-1">
                {emailError}
              </div>
            )}
          </div>
        </div>
        <div className="mb-3.5">
          <label className={LABEL_CLS}>Address</label>
          <input
            type="text"
            disabled={!canEdit}
            value={business.address}
            onChange={(e) => setBusiness((b) => ({ ...b, address: e.target.value }))}
            className={INPUT_CLS}
            placeholder="123 High Street, Exampletown"
          />
        </div>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} disabled={!canEdit} />
      </CardBody>
    </Card>
  );
}
