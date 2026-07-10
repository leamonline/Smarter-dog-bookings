import { useMemo, useState } from "react";
import { getHumanByIdOrName, buildMarkPaidPatch } from "../../../engine/bookingRules";
import { PAYMENT_METHODS, paymentMethodLabel } from "../../../constants/salon";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { titleCase } from "../../../utils/text";
import {
  DetailRow,
  LogisticsLabel,
  FinanceLabel,
  MODAL_INPUT_CLS,
  Row,
} from "./shared.jsx";
import { CreditCard } from "lucide-react";
import { PanelShell } from "../shell/index.js";

/**
 * Card 3 of the booking detail surface: payments and pick-up. Edit mode
 * exposes the payment status (plus method + amount once "Paid in Full" is
 * chosen — a confirmation with defaults, not data entry), the deposit amount
 * and the pick-up human select (limited to the owner plus their trusted
 * contacts); read mode shows the settled state or a one-tap "Mark paid"
 * (Cash/Card/Bank transfer) while money is still owed. Pick-up messaging
 * lives in the ReminderCard so "told them it's ready" stays distinct from
 * the reminder status.
 */
export function PaymentsPickupCard({
  booking,
  isEditing,
  editData,
  setEditData,
  humans,
  primaryHuman,
  pricing,
  onUpdate,
  currentDateStr,
}) {
  const toast = useToast();
  const [savingPayment, setSavingPayment] = useState(false);

  const markPaid = async (methodId) => {
    if (!onUpdate || savingPayment) return;
    setSavingPayment(true);
    // pricing.subtotal already resolved the dog's customPrice upstream in
    // BookingDetailModal, so pass it as the explicit amount.
    const result = await onUpdate(
      {
        ...booking,
        ...buildMarkPaidPatch(
          { service: booking.service, size: booking.size, addons: booking.addons },
          methodId,
          pricing?.subtotal,
        ),
      },
      currentDateStr,
      currentDateStr,
    );
    setSavingPayment(false);
    if (result !== null) toast.show("Payment recorded", "success");
  };
  const trustedHumans = useMemo(() => {
    const trusted = primaryHuman?.trustedIds || [];
    const ownerId = primaryHuman?.id || booking._ownerId || null;
    const ownerName = primaryHuman?.fullName || booking.owner || "";

    const items = [ownerId || ownerName, ...trusted];
    const unique = [];
    for (const item of items) {
      if (!item) continue;
      if (!unique.includes(item)) unique.push(item);
    }
    return unique;
  }, [primaryHuman, booking._ownerId, booking.owner]);

  const basePickupOptions = trustedHumans.map((value) => {
    const human = getHumanByIdOrName(humans, value);
    return {
      value: human?.id || value,
      label: titleCase(
        human?.fullName ||
        `${human?.name || ""} ${human?.surname || ""}`.trim() ||
        value
      ),
    };
  });

  // Always keep the booking's CURRENT pick-up human selectable, even if they
  // aren't (or are no longer) in the owner's trusted list — otherwise the
  // <select> value wouldn't match any <option> and would silently fall back
  // to showing the owner. The option value is editData.pickupBy verbatim so
  // it always matches the controlled select's value.
  const currentValue = editData.pickupBy || "";
  const pickupOptions =
    !currentValue || basePickupOptions.some((o) => o.value === currentValue)
      ? basePickupOptions
      : [
          {
            value: currentValue,
            label: titleCase(
              getHumanByIdOrName(humans, currentValue)?.fullName || currentValue,
            ),
          },
          ...basePickupOptions,
        ];

  const selectedPickupLabel = titleCase(
    getHumanByIdOrName(humans, editData.pickupBy)?.fullName ||
    editData.pickupBy ||
    booking.pickupBy ||
    booking.owner
  );

  if (isEditing) {
    return (
      <PanelShell eyebrow="Payment & pickup" icon={CreditCard} accent="amber" className="mb-3">
        <DetailRow
          label={<FinanceLabel text="Payment Status" />}
          value={editData.payment}
          editNode={
            <select
              value={editData.payment}
              onChange={(e) => {
                const payment = e.target.value;
                // Switching into Paid in Full prefills the amount with the
                // appointment total (custom price + add-ons) so recording a
                // payment is confirm-and-save, not typing.
                setEditData((prev) => ({
                  ...prev,
                  payment,
                  paidAmount:
                    payment === "Paid in Full"
                      ? prev.paidAmount ?? pricing?.subtotal ?? null
                      : prev.paidAmount,
                }));
              }}
              className={MODAL_INPUT_CLS}
            >
              <option value="Due at Pick-up">Due at Pick-up</option>
              <option value="Deposit Paid">Deposit Paid</option>
              <option value="Paid in Full">Paid in Full</option>
            </select>
          }
          isEditing={isEditing}
        />
        {editData.payment === "Paid in Full" && (
          <>
            <DetailRow
              label={<FinanceLabel text="Paid By" />}
              value={paymentMethodLabel(editData.paymentMethod) || "—"}
              editNode={
                <select
                  value={editData.paymentMethod || "card"}
                  onChange={(e) => setEditData((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  className={MODAL_INPUT_CLS}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              }
              isEditing={isEditing}
            />
            <DetailRow
              label={<FinanceLabel text="Amount Taken" />}
              value={`£${editData.paidAmount ?? ""}`}
              editNode={
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">{"£"}</span>
                  <input
                    type="number"
                    min="0"
                    value={editData.paidAmount ?? ""}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        paidAmount: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border"
                  />
                </div>
              }
              isEditing={isEditing}
            />
          </>
        )}
        {editData.payment === "Deposit Paid" && (
          <DetailRow
            label={<FinanceLabel text="Deposit Amount" />}
            value={`£${editData.depositAmount}`}
            editNode={
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">{"£"}</span>
                <input type="number" min="0" value={editData.depositAmount} onChange={(e) => setEditData((prev) => ({ ...prev, depositAmount: Number(e.target.value) }))} className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border" />
              </div>
            }
            isEditing={isEditing}
          />
        )}
        <DetailRow
          label={<LogisticsLabel text="Pick-up Human" />}
          value={selectedPickupLabel}
          editNode={
            <select value={editData.pickupBy} onChange={(e) => setEditData((prev) => ({ ...prev, pickupBy: e.target.value }))} className={MODAL_INPUT_CLS}>
              {pickupOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
            </select>
          }
          isEditing={isEditing}
        />
      </PanelShell>
    );
  }

  const isPaid = (booking.payment || "Due at Pick-up") === "Paid in Full";
  const amountDue = pricing?.amountDue ?? null;

  return (
    <PanelShell eyebrow="Payment & pickup" icon={CreditCard} accent="amber" className="mb-3">
      {isPaid ? (
        <Row
          label="Payment"
          value={[
            booking.paidAmount != null ? `£${booking.paidAmount}` : "Paid in full",
            paymentMethodLabel(booking.paymentMethod),
          ]
            .filter(Boolean)
            .join(" — ")}
        />
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap py-1.5 border-b border-slate-100 mb-1.5">
          <span className="text-[13px] font-bold text-amber-800">
            {amountDue != null ? `£${amountDue} due` : booking.payment || "Due at Pick-up"}
          </span>
          {onUpdate && (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-semibold text-slate-500">Mark paid:</span>
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={savingPayment}
                  onClick={() => markPaid(m.id)}
                  className="text-[12px] font-bold py-1 px-2 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 cursor-pointer transition-all hover:brightness-95 disabled:opacity-50 font-[inherit]"
                >
                  {m.label}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      <Row
        label="Pick-up Human"
        value={titleCase(booking.pickupBy || booking.owner)}
        last
      />
    </PanelShell>
  );
}
