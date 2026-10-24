import { useState } from "react";

interface DepositBankDetails {
  accountName: string;
  sortCode: string;
  accountNumber: string;
}

interface DepositHoldInstructionsProps {
  amount: number;
  reference: string | null;
  dueBy: string | null;
  bank: DepositBankDetails | null;
  compact?: boolean;
}

function formatDepositDeadline(dueBy: string | null): string | null {
  if (!dueBy) return null;
  const deadline = new Date(dueBy);
  if (Number.isNaN(deadline.getTime())) return null;
  return deadline.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

interface CopyTarget {
  label: string;
  value: string;
  copied: string;
}

const COPY_FALLBACK = "Couldn't copy that — please copy it by hand from the details above.";

// The deposit is paid from a banking app, so these are the details a customer
// would otherwise retype — and a mistyped reference is a payment staff cannot
// match. The details stay on screen as plain text, which is the fallback when
// the browser will not copy. The status line only ever says what was copied:
// copying is not paying, and nothing here may suggest otherwise.
function CopyDetails({ targets }: { targets: CopyTarget[] }) {
  const [message, setMessage] = useState("");
  if (targets.length === 0) return null;

  async function copy(target: CopyTarget) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(target.value);
      setMessage(target.copied);
    } catch {
      setMessage(COPY_FALLBACK);
    }
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {targets.map((target) => (
          <button
            key={target.label}
            type="button"
            className="portal-btn portal-btn--secondary"
            onClick={() => void copy(target)}
          >
            {target.label}
          </button>
        ))}
      </div>
      <span
        role="status"
        style={{ display: "block", marginTop: message ? 6 : 0, fontSize: 13 }}
      >
        {message}
      </span>
    </div>
  );
}

export function DepositHoldInstructions({
  amount,
  reference,
  dueBy,
  bank,
  compact = false,
}: DepositHoldInstructionsProps) {
  const deadline = formatDepositDeadline(dueBy);
  const paragraphStyle = compact ? { margin: "6px 0" } : undefined;
  const copyTargets: CopyTarget[] = [];
  if (reference) {
    copyTargets.push({ label: "Copy reference", value: reference, copied: "Reference copied" });
  }
  if (bank) {
    copyTargets.push(
      { label: "Copy sort code", value: bank.sortCode, copied: "Sort code copied" },
      { label: "Copy account number", value: bank.accountNumber, copied: "Account number copied" },
    );
  }

  return (
    <>
      <p style={paragraphStyle}>
        Please send the £{amount} deposit
        {deadline ? <> by <strong>{deadline}</strong></> : null}
        {reference ? <> using reference <strong>{reference}</strong></> : null}
        {" "}to hold this appointment.
      </p>
      {bank && (
        <p style={paragraphStyle}>
          Bank details: <strong>{bank.accountName}</strong>, sort code{" "}
          <strong>{bank.sortCode}</strong>, account{" "}
          <strong>{bank.accountNumber}</strong>.
        </p>
      )}
      <CopyDetails targets={copyTargets} />
      {deadline ? (
        <p style={paragraphStyle}>
          If we can&apos;t match it by then, the appointment will be released
          automatically.
        </p>
      ) : (
        <p style={paragraphStyle}>
          We&apos;ll confirm the appointment once we&apos;ve matched your
          deposit.
        </p>
      )}
      <p style={paragraphStyle}>
        Deposits are non-refundable and can&apos;t be transferred to another
        date if you don&apos;t show.
      </p>
    </>
  );
}
