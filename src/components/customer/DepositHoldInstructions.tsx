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

export function DepositHoldInstructions({
  amount,
  reference,
  dueBy,
  bank,
  compact = false,
}: DepositHoldInstructionsProps) {
  const deadline = formatDepositDeadline(dueBy);
  const paragraphStyle = compact ? { margin: "6px 0" } : undefined;

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
