import { useState, useEffect, useCallback } from "react";
import { isAccountBackendAvailable, updateStaffProfile, updateAccountEmail } from "../../../supabase/repositories/accountRepo";
import { Card, CardHead, CardBody, SaveButton, LABEL_CLS, INPUT_CLS, isValidEmail } from "./shared.jsx";
import { DeviceNotifications } from "./DeviceNotifications.jsx";

export function AccountSettings({ user, staffProfile, onDirtyChange }) {
  const initial = {
    displayName: staffProfile?.display_name || "",
    phone: staffProfile?.phone || "",
    email: user?.email || "",
  };
  const [account, setAccount] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [emailPending, setEmailPending] = useState(false);

  const dirty =
    account.displayName !== baseline.displayName ||
    account.phone !== baseline.phone ||
    account.email !== baseline.email;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const handleSave = useCallback(async () => {
    if (!isAccountBackendAvailable() || !staffProfile?.id) return;
    if (account.email.trim() && !isValidEmail(account.email)) {
      setError("That email doesn't look right — please check and try again");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    setEmailPending(false);

    try {
      const { error: profileErr } = await updateStaffProfile(staffProfile.id, {
        displayName: account.displayName,
        phone: account.phone,
      });
      if (profileErr) throw profileErr;

      if (account.email.trim() && account.email.trim() !== user?.email) {
        const { error: emailErr } = await updateAccountEmail(account.email.trim());
        if (emailErr) throw emailErr;
        setEmailPending(true);
      }

      setBaseline(account);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Couldn't save your changes — please try again");
    } finally {
      setSaving(false);
    }
  }, [account, staffProfile, user]);

  return (
    <>
    <Card id="settings-account">
      <CardHead variant="blue" title="Your Account" desc="Login credentials and contact details" />
      <CardBody>
        <div className="mb-3">
          <label className={LABEL_CLS}>Display Name</label>
          <input
            type="text"
            value={account.displayName}
            onChange={(e) => setAccount((a) => ({ ...a, displayName: e.target.value }))}
            placeholder="e.g. Sarah"
            className={INPUT_CLS}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className={LABEL_CLS}>Phone Number</label>
            <input
              type="tel"
              value={account.phone}
              onChange={(e) => setAccount((a) => ({ ...a, phone: e.target.value }))}
              placeholder="07700 900000"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email Address</label>
            <input
              type="email"
              value={account.email}
              onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
              placeholder="you@smarterdog.co.uk"
              className={INPUT_CLS}
            />
            {emailPending && (
              <div className="text-xs text-brand-teal-text mt-1.5">
                Confirmation sent to {account.email} — click the link in the email to confirm
              </div>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg mb-3">
            {error}
          </div>
        )}

        <div className="mb-1">
          <SaveButton onClick={handleSave} saving={saving} saved={saved} />
        </div>

        {/* Password reset */}
        <div className="border-t border-slate-200 pt-3.5 mt-3.5">
          <div className="text-sm font-semibold text-slate-800 mb-1">Password</div>
          <div className="text-[13px] text-slate-500 mb-2.5">
            Save any changes, then sign out and choose “Forgot password?” on the staff sign-in page.
            Complete the security check there to request a reset link by email.
          </div>
        </div>
      </CardBody>
    </Card>
    <DeviceNotifications user={user} />
    </>
  );
}
