import { useState } from "react";
import { BOOKING_STATUS, PAYMENT_METHODS, paymentMethodLabel } from "../../../constants/salon";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { buildMarkPaidPatch } from "../../../engine/bookingRules";
import { DetailRow, FinanceLabel, MODAL_INPUT_CLS } from "./shared.jsx";

export function PaymentStateSection({
  booking,
  isEditing,
  editData,
  setEditData,
  pricing,
  onUpdate,
  currentDateStr,
}) {
  const toast = useToast();
  const [savingMethod, setSavingMethod] = useState(null);

  if (isEditing) {
    return (
      <div data-testid="payment-state" data-priority="normal">
        <DetailRow
          label={<FinanceLabel text="Payment Status" />}
          value={editData.payment}
          editNode={
            <select
              value={editData.payment}
              onChange={(event) => {
                const payment = event.target.value;
                setEditData((previous) => ({
                  ...previous,
                  payment,
                  paidAmount:
                    payment === "Paid in Full"
                      ? previous.paidAmount ?? pricing?.subtotal ?? null
                      : previous.paidAmount,
                }));
              }}
              className={MODAL_INPUT_CLS}
            >
              <option value="Due at Pick-up">Due at Pick-up</option>
              <option value="Deposit Paid">Deposit Paid</option>
              <option value="Paid in Full">Paid in Full</option>
            </select>
          }
          isEditing
        />
        {editData.payment === "Paid in Full" && (
          <>
            <DetailRow
              label={<FinanceLabel text="Paid By" />}
              value={paymentMethodLabel(editData.paymentMethod) || "—"}
              editNode={
                <select
                  value={editData.paymentMethod || "card"}
                  onChange={(event) =>
                    setEditData((previous) => ({
                      ...previous,
                      paymentMethod: event.target.value,
                    }))
                  }
                  className={MODAL_INPUT_CLS}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.label}
                    </option>
                  ))}
                </select>
              }
              isEditing
            />
            <DetailRow
              label={<FinanceLabel text="Amount Taken" />}
              value={`£${editData.paidAmount ?? ""}`}
              editNode={
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">£</span>
                  <input
                    type="number"
                    min="0"
                    value={editData.paidAmount ?? ""}
                    onChange={(event) =>
                      setEditData((previous) => ({
                        ...previous,
                        paidAmount: event.target.value === "" ? null : Number(event.target.value),
                      }))
                    }
                    className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border"
                  />
                </div>
              }
              isEditing
            />
          </>
        )}
        {editData.payment === "Deposit Paid" && (
          <DetailRow
            label={<FinanceLabel text="Deposit Amount" />}
            value={`£${editData.depositAmount}`}
            editNode={
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">£</span>
                <input
                  type="number"
                  min="0"
                  value={editData.depositAmount}
                  onChange={(event) =>
                    setEditData((previous) => ({
                      ...previous,
                      depositAmount: Number(event.target.value),
                    }))
                  }
                  className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border"
                />
              </div>
            }
            isEditing
          />
        )}
      </div>
    );
  }

  const isPaid = (booking.payment || "Due at Pick-up") === "Paid in Full";
  const isReady = booking.status === BOOKING_STATUS.READY_FOR_PICKUP;
  const amountToCollect = pricing.amountDue;
  const settledTotal = pricing.subtotal;
  const depositPaid = pricing.depositPaid ?? booking.depositAmount ?? 0;
  const paidAmount = booking.paidAmount ?? settledTotal;

  const markPaid = async (methodId) => {
    if (!onUpdate || savingMethod) return;
    setSavingMethod(methodId);
    try {
      const result = await onUpdate(
        {
          ...booking,
          ...buildMarkPaidPatch(
            { service: booking.service, size: booking.size, addons: booking.addons },
            methodId,
            settledTotal,
          ),
        },
        currentDateStr,
        currentDateStr,
      );
      if (result !== null) toast.show("Payment recorded", "success");
    } finally {
      setSavingMethod(null);
    }
  };

  return (
    <div
      data-testid="payment-state"
      data-priority={isReady && !isPaid ? "high" : "normal"}
      aria-busy={savingMethod ? "true" : undefined}
      className={`rounded-xl px-3 py-3 ${isPaid ? "bg-emerald-50" : "bg-amber-50"}`}
    >
      {isPaid ? (
        <p className="text-[14px] font-bold text-emerald-800">
          Paid £{paidAmount}
          {paymentMethodLabel(booking.paymentMethod)
            ? ` · ${paymentMethodLabel(booking.paymentMethod)}`
            : ""}
        </p>
      ) : (
        <>
          <p className="text-[14px] font-bold text-amber-900">
            {pricing.isDepositPaid || booking.payment === "Deposit Paid"
              ? `£${depositPaid} paid · £${amountToCollect} to pay`
              : `£${amountToCollect} to pay`}
          </p>
          {onUpdate && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  aria-label={`Record £${amountToCollect} ${method.label.toLowerCase()} payment`}
                  disabled={Boolean(savingMethod)}
                  onClick={() => markPaid(method.id)}
                  className="min-h-11 px-2 rounded-lg border border-emerald-300 bg-white text-[12px] font-bold text-emerald-800 cursor-pointer transition-all hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 font-[inherit]"
                >
                  {savingMethod === method.id ? "Recording…" : method.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
