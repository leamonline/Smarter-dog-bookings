import { useState, useMemo, useEffect } from "react";
import { canBookSlot } from "../../engine/capacity.js";
import {
  getAllowedServicesForSize,
  getServicePriceLabel,
  normalizeServiceForSize,
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { IconSearch } from "../icons/index.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";

export function AddBookingForm({
  slot,
  onAdd,
  onCancel,
  bookings,
  activeSlots,
  dogs,
  humans,
  prefill,
  slotOverrides,
  selectedSeatIndex = null,
}) {
  const toast = useToast();

  const initialDog = prefill
    ? getDogByIdOrName(dogs, prefill._dogId || prefill.dogName) || {
        id: prefill._dogId || null,
        name: prefill.dogName,
        breed: prefill.breed,
        size: prefill.size,
        humanId: prefill.owner,
        _humanId: prefill._ownerId || null,
      }
    : null;

  const initialSize = prefill?.size || initialDog?.size || "small";

  const [dogQuery, setDogQuery] = useState(prefill?.dogName || "");
  const [selectedDog, setSelectedDog] = useState(initialDog);
  const [size, setSize] = useState(initialSize);
  const [service, setService] = useState(
    normalizeServiceForSize(prefill?.service || "full-groom", initialSize),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const allowedServices = useMemo(
    () => getAllowedServicesForSize(size),
    [size],
  );

  useEffect(() => {
    setService((current) => normalizeServiceForSize(current, size));
  }, [size]);

  const dogResults = useMemo(() => {
    if (!dogQuery.trim() || selectedDog) return [];
    const query = dogQuery.toLowerCase().trim();

    return Object.values(dogs || {})
      .filter((dog) => {
        const ownerName = dog.humanId || "";
        return `${dog.name} ${dog.breed} ${ownerName}`
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 6);
  }, [dogQuery, dogs, selectedDog]);

  const selectedOwner =
    getHumanByIdOrName(
      humans,
      selectedDog?._humanId ||
        selectedDog?.humanId ||
        prefill?._ownerId ||
        null,
    ) ||
    getHumanByIdOrName(humans, selectedDog?.humanId) ||
    getHumanByIdOrName(humans, prefill?._ownerId) ||
    null;

  const ownerName =
    selectedOwner?.fullName || selectedDog?.humanId || prefill?.owner || "";

  const handleSelectDog = (dog) => {
    setSelectedDog(dog);
    setDogQuery(dog.name);
    if (dog.size) {
      setSize(dog.size);
      setService((current) => normalizeServiceForSize(current, dog.size));
    }
    setError("");
  };

  const handleClearDog = () => {
    setSelectedDog(null);
    setDogQuery("");
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedDog) {
      setError("Select a dog from the list");
      return;
    }

    if (!service || !allowedServices.some((s) => s.id === service)) {
      setError("Select a valid service for this dog size");
      return;
    }

    const check = canBookSlot(bookings, slot, size, activeSlots, {
      slotOverrides,
      selectedSeatIndex,
      dogId: selectedDog.id || null,
    });

    if (!check.allowed) {
      setError(check.reason);
      return;
    }

    setSubmitting(true);
    setError("");

    const result = await onAdd({
      id: Date.now(),
      slot,
      dogName: selectedDog.name,
      breed: selectedDog.breed,
      size,
      service,
      owner: ownerName,
      status: prefill?.status || "No-show",
      addons: prefill?.addons || [],
      pickupBy: prefill?.pickupBy || ownerName,
      payment: prefill?.payment || "Due at Pick-up",
      confirmed: prefill?.confirmed ?? false,
      _dogId: selectedDog.id || prefill?._dogId || null,
      _ownerId:
        selectedDog._humanId || selectedOwner?.id || prefill?._ownerId || null,
      _pickupById: prefill?._pickupById || null,
    });

    setSubmitting(false);

    if (result) {
      toast.show(`${selectedDog.name} booked in`, "success");
    } else {
      setError("Could not save booking. Please try again.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1.5 mt-1.5 animate-[fadeIn_0.12s_ease-out]"
    >
      {selectedDog ? (
        <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-brand-cyan-dark">
              {selectedDog.name}
            </div>
            <div className="text-[11px] text-slate-800">
              {selectedDog.breed} · {ownerName || "Unknown owner"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearDog}
            className="bg-white border border-slate-200 rounded-md px-2 py-[3px] text-[11px] font-semibold cursor-pointer text-slate-500 font-inherit"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex pointer-events-none">
            <IconSearch size={13} colour="#6B7280" />
          </div>
          <input
            placeholder="Search dog by name, breed, or owner..."
            value={dogQuery}
            onChange={(e) => {
              setDogQuery(e.target.value);
              setError("");
            }}
            className="w-full py-[7px] pl-[26px] pr-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border transition-colors focus:border-brand-cyan"
            autoFocus
          />
          {dogResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-0.5 z-20 bg-white border border-slate-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-[200px] overflow-auto">
              {dogResults.map((dog) => (
                <div
                  key={dog.id}
                  onMouseDown={() => handleSelectDog(dog)}
                  className="px-2.5 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-blue-50"
                >
                  <div className="text-[13px] font-semibold text-slate-800">
                    {dog.name}{" "}
                    <span className="font-normal text-slate-500">
                      ({dog.breed})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {dog.humanId}
                    {dog.size ? ` · ${dog.size}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
          {dogQuery.trim().length >= 2 &&
            dogResults.length === 0 &&
            !selectedDog && (
              <div className="text-[11px] text-slate-500 mt-0.5 pl-0.5">
                No dogs found. Add a dog from the Dogs directory first.
              </div>
            )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={size}
          aria-label="Dog size"
          onChange={(e) => {
            const nextSize = e.target.value;
            setSize(nextSize);
            setError("");
          }}
          className="py-[7px] px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] outline-none w-full box-border font-inherit cursor-pointer"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>

        <select
          value={service}
          aria-label="Grooming service"
          onChange={(e) => {
            setService(e.target.value);
            setError("");
          }}
          className="py-[7px] px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] outline-none w-full box-border font-inherit cursor-pointer"
        >
          {allowedServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {getServicePriceLabel(s.id, size)}
            </option>
          ))}
        </select>
      </div>

      {allowedServices.length === 0 && (
        <div className="text-xs text-brand-coral font-medium py-0.5">
          No valid services are available for this dog size.
        </div>
      )}

      <div aria-live="polite" aria-atomic="true">
        {error && (
          <div className="text-xs text-brand-coral font-medium py-0.5" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={submitting || allowedServices.length === 0}
          className="flex-1 btn btn-primary btn-sm"
        >
          {submitting ? "Saving..." : "Confirm"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
