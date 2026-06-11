import { useMemo } from "react";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
import { titleCase } from "../../../utils/text";
import { IconMessage } from "../../icons/index.jsx";
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
 * pick-up human and, when we hold a phone number, a one-tap
 * "ready for collection" SMS link tinted to match the booking status.
 */
export function PaymentsPickupCard({
  booking,
  isEditing,
  editData,
  setEditData,
  humans,
  primaryHuman,
  pickupHuman,
  statusObj,
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

  const pickupOptions = trustedHumans.map((value) => {
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
        last={!pickupHuman?.phone}
      />
      {pickupHuman?.phone && (
        <a
          href={`sms:${pickupHuman.phone}?body=${encodeURIComponent(`Hey, it's Smarter Dog Grooming Salon\n${titleCase(booking.dogName)} will be ready for collection in 15mins.\nSee you soon 🎓🐶❤️ X`)}`}
          className="flex items-center justify-center gap-2 my-3 py-3 rounded-xl text-[14px] font-bold no-underline transition-all duration-150 hover:-translate-y-0.5 hover:brightness-95 shadow-[0_6px_16px_-6px_rgba(15,23,42,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          style={{ background: statusObj.border, color: statusObj.onAccent }}
          aria-label={`Send pickup-ready SMS to ${titleCase(pickupHuman.fullName || booking.pickupBy || booking.owner)}`}
        >
          <IconMessage size={16} colour="currentColor" />
          <span>Message {titleCase(pickupHuman.fullName || booking.pickupBy || booking.owner)}</span>
        </a>
      )}
    </PanelShell>
  );
}
