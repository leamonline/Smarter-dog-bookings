import { getHumanByIdOrName } from "../../../engine/bookingRules";
import { titleCase } from "../../../utils/text";
import {
  DetailRow,
  LogisticsLabel,
  MODAL_INPUT_CLS,
  Row,
} from "./shared.jsx";

function buildPickupOptions({ booking, editData, humans, primaryHuman }) {
  const ownerId = primaryHuman?.id || booking._ownerId || booking.owner;
  const values = [ownerId, ...(primaryHuman?.trustedIds || [])].filter(Boolean);
  const currentValue = editData.pickupBy || booking.pickupBy || booking.owner;
  if (currentValue && !values.includes(currentValue)) values.unshift(currentValue);

  return [...new Set(values)].map((value) => {
    const human = getHumanByIdOrName(humans, value);
    return {
      value: human?.id || value,
      label: titleCase(human?.fullName || `${human?.name || ""} ${human?.surname || ""}`.trim() || value),
    };
  });
}

export function PickupPersonField({ booking, editData, setEditData, humans, primaryHuman, isEditing }) {
  const options = buildPickupOptions({ booking, editData, humans, primaryHuman });
  const selected = titleCase(
    getHumanByIdOrName(humans, editData.pickupBy)?.fullName ||
    editData.pickupBy || booking.pickupBy || booking.owner,
  );

  if (!isEditing) return <Row label="Pick-up person" value={selected} />;

  return (
    <DetailRow
      label={<LogisticsLabel text="Pick-up person" />}
      value={selected}
      editNode={
        <select
          aria-label="Pick-up person"
          value={editData.pickupBy}
          onChange={(event) => setEditData((previous) => ({ ...previous, pickupBy: event.target.value }))}
          className={MODAL_INPUT_CLS}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      }
      isEditing
    />
  );
}
