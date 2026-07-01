import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase/client.js";
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
  const [pwSending, setPwSending] = useState(false);
  const [pwSent, setPwSent] = useState(false);

  const dirty =
    account.displayName !== baseline.displayName ||
    account.phone !== baseline.phone ||
    account.email !== baseline.email;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const handleSave = useCallback(async () => {
    if (!supabase || !staffProfile?.id) return;
    if (account.email.trim() && !isValidEmail(account.email)) {
      setError("That email doesn't look right — please check and try again");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    setEmailPending(false);

    try {
      const { error: profileErr } = await supabase
        .from("staff_profiles")
        .update({ display_name: account.displayName, phone: account.phone })
        .eq("id", staffProfile.id);
      if (profileErr) throw profileErr;

      if (account.email.trim() && account.email.trim() !== user?.email) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: account.email.trim() });
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

  const handlePasswordReset = async () => {
    if (!supabase || !user?.email) return;
    setPwSending(true);
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPwSending(false);
    setPwSent(true);
    setTimeout(() => setPwSent(false), 5000);
  };

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
            We'll email you a link to reset your password
          </div>
          <button
            onClick={handlePasswordReset}
            disabled={pwSending || pwSent}
            className={`px-[18px] py-[9px] rounded-control border text-[13px] font-bold font-inherit transition-all ${
              pwSent
                ? "bg-[#E6F5F2] text-brand-teal border-brand-teal cursor-default"
                : pwSending
                  ? "bg-white text-slate-500 border-slate-200 cursor-default"
                  : "bg-white text-slate-800 border-slate-200 cursor-pointer hover:border-brand-teal hover:text-brand-teal"
            }`}
          >
            {pwSending ? "Sending\u2026" : pwSent ? "\u2713 Link sent \u2014 check your email" : "Send password reset link"}
          </button>
        </div>
      </CardBody>
    </Card>
    <DeviceNotifications user={user} />
    </>
  );
}
