import { useState, useEffect } from "react";

export function CustomerLoginPage({ onRequestOtp, onVerifyOtp, onResetOtp, otpSent, phone, error, onDemoMode }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  // OTP cooldown timer — prevent customers from spamming "Send Code"
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Format phone for display: 07xxx -> +44 7xxx
  const normalisePhone = (raw) => {
    let p = raw.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
    if (p.startsWith("07")) p = "+44" + p.slice(1);
    if (p.startsWith("44") && !p.startsWith("+44")) p = "+" + p;
    if (!p.startsWith("+44")) return ""; // reject non-UK numbers
    return p;
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (otpCooldown > 0) {
      setLocalError(`Please wait ${otpCooldown}s before requesting another code.`);
      return;
    }
    const normalised = normalisePhone(phoneInput);
    if (normalised.length < 12) {
      setLocalError("Please enter a valid UK mobile number.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    await onRequestOtp(normalised);
    setSubmitting(false);
    setOtpCooldown(60); // 60-second cooldown
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (code.length < 6) {
      setLocalError("Please enter the 6-digit code.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    await onVerifyOtp(code);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FFFE] flex items-center justify-center p-5 font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
      <div className="w-full max-w-[400px]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-[32px] font-extrabold text-slate-800">
            Smarter<span className="text-brand-teal">Dog</span>
          </div>
          <div className="text-sm text-slate-500 mt-1">Customer Portal</div>
        </div>

        <div className="bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          {!otpSent ? (
            <>
              <div className="text-lg font-extrabold text-slate-800 mb-1">
                Welcome
              </div>
              <div className="text-[13px] text-slate-500 mb-5">
                Enter your mobile number and we'll text you a login code.
              </div>
              <form onSubmit={handleRequestOtp}>
                <label className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide block mb-1.5">Mobile Number</label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => { setPhoneInput(e.target.value); setLocalError(""); }}
                  placeholder="07700 900000"
                  className="w-full py-3.5 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-base font-[inherit] box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  autoFocus
                  autoComplete="tel"
                />
                {(localError || error) && (
                  <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light py-2 px-3 rounded-lg mt-2">
                    {localError || error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3.5 rounded-[10px] border-none text-[15px] font-bold font-[inherit] transition-all mt-2 ${
                    submitting
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-brand-teal text-white cursor-pointer"
                  }`}
                >
                  {submitting ? "Sending..." : "Send Login Code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-lg font-extrabold text-slate-800 mb-1">
                Check your phone
              </div>
              <div className="text-[13px] text-slate-500 mb-5">
                We sent a 6-digit code to <strong>{phone}</strong>
              </div>
              <form onSubmit={handleVerifyOtp}>
                <label className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide block mb-1.5">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setLocalError(""); }}
                  placeholder="000000"
                  className="w-full py-3.5 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-2xl font-[inherit] box-border outline-none text-slate-800 transition-colors text-center tracking-[8px] font-bold focus:border-brand-teal"
                  autoFocus
                  autoComplete="one-time-code"
                />
                {(localError || error) && (
                  <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light py-2 px-3 rounded-lg mt-2">
                    {localError || error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3.5 rounded-[10px] border-none text-[15px] font-bold font-[inherit] transition-all mt-2 ${
                    submitting
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-brand-teal text-white cursor-pointer"
                  }`}
                >
                  {submitting ? "Verifying..." : "Verify & Sign In"}
                </button>
              </form>
              <button
                onClick={onResetOtp}
                className="w-full mt-3 py-2.5 rounded-[10px] border border-slate-200 bg-white text-[13px] font-semibold text-slate-500 cursor-pointer font-[inherit]"
              >
                Use a different number
              </button>
            </>
          )}
        </div>

        {/* Demo mode button */}
        {onDemoMode && (
          <button
            onClick={onDemoMode}
            className="w-full mt-4 py-3 rounded-[10px] border-[1.5px] border-dashed border-slate-500 bg-transparent text-[13px] font-semibold text-slate-500 cursor-pointer font-[inherit] transition-all hover:border-brand-teal hover:text-brand-teal"
          >
            Demo Mode — Preview as a customer
          </button>
        )}
      </div>
    </div>
  );
}
