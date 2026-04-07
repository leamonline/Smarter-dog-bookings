import { useState, useCallback } from "react";
import { supabase } from "../../../supabase/client.js";
import { Card, CardHead, CardBody, SaveButton, LABEL_CLS, INPUT_CLS } from "./shared.jsx";

export function AccountSettings({ user, staffProfile }) {
  const [account, setAccount] = useState({
    displayName: staffProfile?.display_name || "",
    phone: staffProfile?.phone || "",
    email: user?.email || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [pwSending, setPwSending] = useState(false);
  const [pwSent, setPwSent] = useState(false);

  const handleSave = useCallback(async () => {
    if (!supabase || !staffProfile?.id) return;
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

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message || "Could not save changes.");
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
              <div className="text-xs text-brand-teal mt-1.5">
                Confirmation sent to {account.email} — click the link to confirm.
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg mb-3">
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
            We'll email you a secure reset link.
          </div>
          <button
            onClick={handlePasswordReset}
            disabled={pwSending || pwSent}
            className={`px-[18px] py-[9px] rounded-[10px] border text-[13px] font-bold font-inherit transition-all ${
              pwSent
                ? "bg-[#E6F5F2] text-brand-teal border-brand-teal cursor-default"
                : pwSending
                  ? "bg-white text-slate-500 border-slate-200 cursor-default"
                  : "bg-white text-slate-800 border-slate-200 cursor-pointer hover:border-brand-teal hover:text-brand-teal"
            }`}
          >
            {pwSending ? "Sending\u2026" : pwSent ? "\u2713 Reset link sent" : "Send password reset link"}
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
