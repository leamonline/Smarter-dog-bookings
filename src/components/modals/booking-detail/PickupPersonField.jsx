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
  const currentHuman = getHumanByIdOrName(humans, currentValue);
  const currentIdentity = currentHuman?.id || currentValue;
  const seen = new Set();
  const options = [];

  for (const value of values) {
    const human = getHumanByIdOrName(humans, value);
    const identity = human?.id || value;
    if (seen.has(identity)) continue;
    seen.add(identity);
    options.push({
      value: identity === currentIdentity ? currentValue : human?.id || value,
      label: titleCase(human?.fullName || `${human?.name || ""} ${human?.surname || ""}`.trim() || value),
    });
  }

  if (currentValue && !seen.has(currentIdentity)) {
    options.unshift({
      value: currentValue,
      label: titleCase(currentHuman?.fullName || currentValue),
    });
  }

  return options;
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
          className={`${MODAL_INPUT_CLS} min-h-11 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2`}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      }
      isEditing
    />
  );
}
