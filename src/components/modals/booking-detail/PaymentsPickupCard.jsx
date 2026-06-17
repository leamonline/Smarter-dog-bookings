import { useMemo } from "react";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
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
 * exposes the payment status, deposit amount and pick-up human select
 * (limited to the owner plus their trusted contacts); read mode shows the
 * chosen pick-up human. Pick-up messaging now lives in the ReminderCard so
 * "told them it's ready" stays distinct from the reminder status.
 */
export function PaymentsPickupCard({
  booking,
  isEditing,
  editData,
  setEditData,
  humans,
  primaryHuman,
}) {
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
            <select value={editData.payment} onChange={(e) => setEditData((prev) => ({ ...prev, payment: e.target.value }))} className={MODAL_INPUT_CLS}>
              <option value="Due at Pick-up">Due at Pick-up</option>
              <option value="Deposit Paid">Deposit Paid</option>
              <option value="Paid in Full">Paid in Full</option>
            </select>
          }
          isEditing={isEditing}
        />
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

  return (
    <PanelShell eyebrow="Payment & pickup" icon={CreditCard} accent="amber" className="mb-3">
      <Row
        label="Pick-up Human"
        value={titleCase(booking.pickupBy || booking.owner)}
        last
      />
    </PanelShell>
  );
}
