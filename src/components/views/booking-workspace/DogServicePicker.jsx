// ============================================================
// src/components/views/booking-workspace/DogServicePicker.jsx
//
// Multi-select of a customer's dogs plus a per-dog service, shared by both
// Booking pane actions.
//
// A dog with no authoritative size is shown but never selectable — capacity
// cannot be computed without one, and guessing risks overbooking the salon.
// ============================================================

import { CircleAlert } from "lucide-react";

import { SERVICES } from "../../../constants/index";
import { availableServicesFor, isDogSelectable } from "./bookingComposerModel.js";

const SERVICE_NAMES = Object.fromEntries(
  SERVICES.map((service) => [service.id, service.name]),
);

const SIZE_LABELS = { small: "Small", medium: "Medium", large: "Large" };

function DogRow({
  dog,
  selected,
  service,
  lastService,
  onToggleDog,
  onSetService,
}) {
  const selectable = isDogSelectable(dog);
  const services = availableServicesFor(dog);
  const detail = [dog.breed, SIZE_LABELS[dog.size]].filter(Boolean).join(" · ");

  return (
    <li>
      {/* min-h-11 keeps the whole row a ~44px touch target, not just the box.
          Selected state reuses the same language as a chosen time slot — a
          soft teal wash and a teal check — so "I want this" looks the same
          everywhere in the pane, whether the control underneath is a
          checkbox or a button. */}
      <label
        className={`flex min-h-11 items-start gap-3 px-3 py-2.5 transition-colors ${
          selectable ? "cursor-pointer" : "cursor-not-allowed"
        } ${selected ? "bg-brand-teal/[0.07]" : selectable ? "hover:bg-slate-50" : ""}`}
      >
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
          checked={selected}
          disabled={!selectable}
          onChange={() => selectable && onToggleDog(dog.id)}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-bold text-brand-purple">
            {dog.name}
          </span>
          {detail ? (
            <span className="mt-0.5 block break-words text-xs text-slate-500">{detail}</span>
          ) : null}
          {lastService && SERVICE_NAMES[lastService] ? (
            <span className="mt-0.5 block text-micro text-slate-500">
              Last: {SERVICE_NAMES[lastService]}
            </span>
          ) : null}
        </span>
        {!selectable ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-micro font-bold text-amber-900">
            <CircleAlert aria-hidden="true" size={12} />
            Size needed
          </span>
        ) : null}
      </label>

      {selected && selectable ? (
        <div className="px-3 pb-3 pl-11">
          <label
            htmlFor={`service-${dog.id}`}
            className="block text-micro font-bold uppercase tracking-wide text-slate-500"
          >
            Service for {dog.name}
          </label>
          <select
            id={`service-${dog.id}`}
            value={service || ""}
            onChange={(event) => onSetService(dog.id, event.target.value)}
            className="mt-1 min-h-11 w-full rounded-control border border-slate-200 bg-white px-2 text-sm font-semibold text-brand-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            {services.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </li>
  );
}

export function DogServicePicker({
  dogs,
  selectedDogIds,
  servicesByDogId,
  lastServiceByDogId,
  onToggleDog,
  onSetService,
}) {
  if (!dogs?.length) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm font-bold text-brand-purple">No dogs on file</p>
        <p className="mt-1 text-xs text-slate-500">
          Add a dog to this customer&apos;s record before booking them in.
        </p>
      </div>
    );
  }

  return (
    <fieldset className="min-w-0">
      {/* The caller (BookingActionsPane) already shows a visible "Choose
          dogs" heading above this picker — this legend exists for the
          fieldset's accessible name, not to say it a second time. */}
      <legend className="sr-only">Choose dogs</legend>
      <ul className="mt-1 list-none">
        {dogs.map((dog) => (
          <DogRow
            key={dog.id}
            dog={dog}
            selected={selectedDogIds.includes(dog.id)}
            service={servicesByDogId[dog.id]}
            lastService={lastServiceByDogId?.[dog.id]}
            onToggleDog={onToggleDog}
            onSetService={onSetService}
          />
        ))}
      </ul>
    </fieldset>
  );
}
