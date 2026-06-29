import { useEffect, useRef, useState } from "react";
import { SALON_SLOTS, SIZE_THEME, SIZE_FALLBACK } from "../../constants/index";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { canBookSlot, isCapacityRejection } from "../../engine/capacity";
import { toDateStr } from "../../supabase/transforms";
import { titleCase, isDateOpen } from "./new-booking/helpers.js";
import { DogSearchSection } from "./new-booking/DogSearchSection.jsx";
import { BookingFormFields } from "./new-booking/BookingFormFields.jsx";
import { NotifyRecipientsDialog } from "./new-booking/NotifyRecipientsDialog.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { fetchTrustedContactsForHuman } from "../../supabase/hooks/humans/useTrustedContacts";

// ─── main modal ─────────────────────────────────────────────────────────────

export function NewBookingModal({
  onClose,
  onAdd,
  // Booking flow: re-open a fresh booking pre-filled with the same owner after a
  // successful save, so a second date (e.g. another dog another day) for a new
  // customer doesn't start from a cold search.
  onBookAnother,
  dogs,
  humans,
  dogsByHumanId,
  ensureDogsForHumans,
  bookingsByDate,
  dayOpenState,
  daySettings,
  onOpenAddDog,
  onOpenAddHuman,
  initialDateStr,
  initialSlot,
  initialHumanId,
  // "Book again" prefill: drop straight to a chosen dog + service so staff
  // don't have to re-search. initialDogId resolves to a dog entry; service
  // and addons seed that entry.
  initialDogId,
  // Resume prefill: dog entries (existing selections + any newly-created dog)
  // restored when the wizard re-opens after staff stepped out to add a
  // dog/human mid-booking. Carries full dog objects, so no map lookup is needed.
  initialEntries,
  initialService,
  initialAddons,
  // When true, saveBooking skips the over-capacity ConfirmDialog and
  // stamps staff_capacity_override on every booking object from the
  // first attempt. Set by the day-view's time-click flow, which has
  // already shown its own override confirm dialog upstream.
  initialStaffCapacityOverride = false,
  sourceMessageText,
  ownerName,
  onSearchDogs,
  isSearchingDogs,
}) {
  const toast = useToast();

  const [dogQuery, setDogQuery] = useState(() => {
    if (initialHumanId) {
      const humansList = humans ? Object.values(humans) : [];
      const owner = humansList.find((h) => h?.id === initialHumanId);
      if (owner) {
        return owner.fullName || `${owner.name || ""} ${owner.surname || ""}`.trim() || "";
      }
    }
    return ownerName || "";
  });
  const [dogEntries, setDogEntries] = useState([]); // { dog, humanKey, service }
  const [selectedHumanKey, setSelectedHumanKey] = useState("");
  const [addingAnotherDog, setAddingAnotherDog] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState(initialDateStr || "");
  const [selectedSlot, setSelectedSlot] = useState(initialSlot || "");
  const [error, setError] = useState("");
  const [recurringWeeks, setRecurringWeeks] = useState(0);
  // Past-date booking confirmation. Set when handleConfirm runs against a
  // date earlier than today; the actual save happens inside the confirm
  // dialog's accept handler. Avoids accidental back-dated bookings while
  // still letting staff log historical records when they need to.
  const [pendingPastConfirm, setPendingPastConfirm] = useState(false);
  const [pendingCapacityOverride, setPendingCapacityOverride] = useState(null);
  // shape: { reason: string, targetDateStr: string }

  // Notification-recipient picker. Shown at confirm time when the dog's owner
  // has trusted humans (owner pre-ticked, trusted opt-in). The chosen ids ride
  // into each booking via notifyHumanIdsRef so buildBookingsForOverride reads
  // them synchronously — component state would lag a tick behind the save.
  const [pendingNotifyPicker, setPendingNotifyPicker] = useState(null);
  const [ownerTrusted, setOwnerTrusted] = useState([]);
  const notifyHumanIdsRef = useRef(null);

  // When the modal opens from a WhatsApp message the humans map may not
  // have hydrated yet, so dogQuery falls back to the conversation's
  // displayName (`ownerName`). Once humans loads with the matching
  // record, upgrade dogQuery to the canonical owner name — but only
  // while we're still showing the fallback (or nothing). If the user
  // has typed anything different, treat that as intent and don't stomp.
  const prefilledOwnerRef = useRef(false);
  useEffect(() => {
    if (prefilledOwnerRef.current) return;
    if (!initialHumanId) return;
    if (dogEntries.length > 0) {
      prefilledOwnerRef.current = true;
      return;
    }
    // Only upgrade from the initial fallback ("" or ownerName).
    const fallback = ownerName || "";
    if (dogQuery && dogQuery !== fallback) {
      prefilledOwnerRef.current = true;
      return;
    }
    const owner = Object.values(humans || {}).find((h) => h?.id === initialHumanId);
    if (!owner) return;
    const resolved = owner.fullName || `${owner.name || ""} ${owner.surname || ""}`.trim();
    if (resolved && resolved !== dogQuery) {
      setDogQuery(resolved);
    }
    prefilledOwnerRef.current = true;
  }, [humans, initialHumanId, dogEntries.length, dogQuery, ownerName]);

  // "Book again" prefill. Make sure the owner's dogs are loaded (the chosen
  // dog may sit past the paginated window), then seed a single dog entry
  // with the original service + addons once that dog is in the map.
  useEffect(() => {
    if (initialDogId && initialHumanId && ensureDogsForHumans) {
      ensureDogsForHumans([initialHumanId]);
    }
  }, [initialDogId, initialHumanId, ensureDogsForHumans]);

  const prefilledDogRef = useRef(false);
  useEffect(() => {
    if (prefilledDogRef.current || !initialDogId) return;
    if (dogEntries.length > 0) {
      prefilledDogRef.current = true;
      return;
    }
    const fromOwner =
      initialHumanId && dogsByHumanId?.[initialHumanId]
        ? dogsByHumanId[initialHumanId].find((d) => d.id === initialDogId)
        : null;
    const dog =
      fromOwner || Object.values(dogs || {}).find((d) => d.id === initialDogId);
    if (!dog) return; // not loaded yet — re-runs when the dogs map updates
    const humanKey = dog.humanId || dog._humanId || "";
    setDogEntries([
      {
        dog,
        humanKey,
        service: initialService || "full-groom",
        addons: initialAddons || [],
      },
    ]);
    setSelectedHumanKey(humanKey);
    setDogQuery(dog.name);
    prefilledDogRef.current = true;
  }, [
    initialDogId,
    initialHumanId,
    initialService,
    initialAddons,
    dogs,
    dogsByHumanId,
    dogEntries.length,
  ]);

  // Resume prefill. When staff parked a booking to create a dog/human, App
  // re-opens the wizard with the preserved (and newly-created) dog entries.
  // We hydrate straight from the passed dog objects — no map lookup or timing
  // dance like initialDogId needs — so the dog they just created is selected
  // immediately and their date/slot (above) come back with it.
  const prefilledEntriesRef = useRef(false);
  useEffect(() => {
    if (prefilledEntriesRef.current) return;
    if (!initialEntries || initialEntries.length === 0) return;
    if (dogEntries.length > 0) {
      prefilledEntriesRef.current = true;
      return;
    }
    const hydrated = initialEntries
      .filter((e) => e?.dog?.id)
      .map((e) => ({
        dog: e.dog,
        humanKey: e.humanKey || e.dog.humanId || "",
        service: e.service || "full-groom",
        addons: e.addons || [],
      }));
    if (hydrated.length === 0) return;
    setDogEntries(hydrated);
    setSelectedHumanKey(hydrated[0].humanKey);
    setDogQuery(hydrated[hydrated.length - 1].dog.name);
    prefilledEntriesRef.current = true;
  }, [initialEntries, dogEntries.length]);

  const hasDogs = dogEntries.length > 0;
  // Owner UUID of the booking's dogs. `_humanId` is the stable owner FK on
  // every dog object; all dogs in one booking share the same owner. Used to
  // load the owner's full dog list for the "add another dog" picker, which
  // can't rely on the paginated `dogs` map containing siblings.
  const selectedHumanId = dogEntries[0]?.dog?._humanId || null;
  const primaryTheme = hasDogs ? (SIZE_THEME[dogEntries[0].dog.size || "small"] || SIZE_FALLBACK) : SIZE_FALLBACK;
  const selectedDogs = dogEntries.map(e => ({ id: e.dog.id, size: e.dog.size || "small", name: e.dog.name }));

  // Load the owner's trusted humans when the owner changes so the recipient
  // picker knows whether to appear — trusted contacts hydrate lazily, so the
  // humans map often doesn't carry them yet. Also clears any prior choice.
  useEffect(() => {
    notifyHumanIdsRef.current = null;
    let cancelled = false;
    if (!selectedHumanId) {
      setOwnerTrusted([]);
      return;
    }
    const owner = Object.values(humans || {}).find((h) => h?.id === selectedHumanId);
    if (owner?.trustedContacts?.length) {
      setOwnerTrusted(owner.trustedContacts);
      return;
    }
    fetchTrustedContactsForHuman(selectedHumanId)
      .then((res) => {
        if (!cancelled) setOwnerTrusted(res.trustedContacts || []);
      })
      .catch(() => {
        if (!cancelled) setOwnerTrusted([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHumanId, humans]);

  // ─── handlers ───────────────────────────────────────────────────────────

  const handleSelectEntry = (entry) => {
    setDogEntries([{ dog: entry.dog, humanKey: entry.humanKey, service: "full-groom", addons: [] }]);
    setSelectedHumanKey(entry.humanKey);
    setDogQuery(entry.dog.name);
    setError("");
  };

  // Snapshot the in-progress booking so App can park it while staff step out to
  // create a new dog/human, then re-open the wizard with their work restored
  // (see App's parkBooking/resumeParkedBooking). Pure UI state — nothing here
  // touches the write path or the capacity/booking gates.
  const captureDraft = () => {
    // Owner of the in-progress booking. Prefer the dogs already chosen
    // (selectedHumanId, derived from dogEntries[0]); fall back to the owner the
    // wizard was opened for (initialHumanId) when no dog is picked yet — e.g.
    // staff just created the customer and now want to add their first dog. This
    // is what lets AddDogModal open owner-locked instead of re-searching the
    // customer they made seconds ago.
    const ownerId = selectedHumanId || initialHumanId || null;
    const owner = ownerId
      ? Object.values(humans || {}).find((h) => h?.id === ownerId)
      : null;
    return {
      dateStr: selectedDateStr,
      slot: selectedSlot,
      entries: dogEntries.map((e) => ({
        dog: e.dog,
        humanKey: e.humanKey,
        service: e.service,
        addons: e.addons || [],
      })),
      owner: owner
        ? { id: owner.id, label: owner.fullName || selectedHumanKey, phone: owner.phone || "" }
        : null,
    };
  };
  const handleOpenAddDog = () => onOpenAddDog?.(captureDraft());
  const handleOpenAddHuman = () => onOpenAddHuman?.(captureDraft());

  const handleAddAnotherDog = (dog) => {
    setDogEntries(prev => [...prev, { dog, humanKey: selectedHumanKey, service: "full-groom", addons: [] }]);
    setAddingAnotherDog(false);
    setSelectedSlot(""); // Reset slot — capacity may have changed
  };

  const handleRemoveDog = (dogId) => {
    setDogEntries(prev => {
      const next = prev.filter(e => e.dog.id !== dogId);
      if (next.length === 0) {
        setSelectedHumanKey("");
        setDogQuery("");
        setSelectedDateStr("");
        setSelectedSlot("");
      }
      return next;
    });
    setSelectedSlot("");
  };

  const handleServiceChange = (dogId, newService) => {
    setDogEntries(prev => prev.map(e =>
      e.dog.id === dogId ? { ...e, service: newService } : e
    ));
  };

  const handleAddonsChange = (dogId, addon) => {
    setDogEntries(prev => prev.map(e => {
      if (e.dog.id !== dogId) return e;
      const current = e.addons || [];
      return {
        ...e,
        addons: current.includes(addon)
          ? current.filter(a => a !== addon)
          : [...current, addon],
      };
    }));
  };

  const handleClearAll = () => {
    setDogEntries([]);
    setSelectedHumanKey("");
    setDogQuery("");
    setSelectedDateStr("");
    setSelectedSlot("");
    setAddingAnotherDog(false);
  };

  const handleSelectDate = (date) => {
    const dateStr = toDateStr(date);
    setSelectedDateStr(dateStr);
    setSelectedSlot("");
  };

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
  };

  const handleConfirm = () => {
    // Collect every missing field in one pass so staff don't have to re-submit
    // three times to find out what's still empty. Closed-day + duplicate-dog
    // checks remain separate because they only make sense once the basics
    // (dog + date + slot) are filled in.
    const missing = [];
    if (dogEntries.length === 0) missing.push("Pick a dog");
    if (!selectedDateStr) missing.push("Pick a date");
    if (!selectedSlot) missing.push("Pick a time");
    if (missing.length > 0) {
      setError(
        missing.length === 1
          ? `${missing[0]} first`
          : `${missing.join(", ")} first`,
      );
      return;
    }

    // Closed-day guard. The TimeSlotPicker is hidden for closed days, but
    // staff can land here via an initialSlot prefill from a closed-day URL
    // or a stale state — fail loudly rather than silently writing a booking
    // the day view treats as cancelled.
    if (!isDateOpen(selectedDateStr, dayOpenState)) {
      setError("We're closed that day. Open it in day view or pick a different date.");
      return;
    }

    // Check for duplicate dogs on the same date/slot. Prefer the stable
    // _dogId — `dog_id` is the DB column name, but the booking objects in
    // bookingsByDate are camelCased and expose it as `_dogId`. Falling back
    // to dogName alone would over-block two different dogs that share a name
    // (e.g. two Alfies), so only treat name as a match when the ids agree
    // or the ids are missing entirely.
    const existingBookings = bookingsByDate?.[selectedDateStr] || [];
    for (const entry of dogEntries) {
      const duplicate = existingBookings.find((b) => {
        if (b.slot !== selectedSlot) return false;
        if (b._dogId && entry.dog.id) return b._dogId === entry.dog.id;
        return b.dogName === entry.dog.name;
      });
      if (duplicate) {
        setError(`${entry.dog.name}'s already booked then`);
        return;
      }
    }

    // Recipient picker: when the owner has trusted humans and we haven't asked
    // yet, choose who gets notified before saving. Owner is the default; trusted
    // humans are opt-in. Skipped entirely when there are no trusted humans.
    if (ownerTrusted.length > 0 && notifyHumanIdsRef.current === null) {
      const owner = Object.values(humans || {}).find((h) => h?.id === selectedHumanId);
      setPendingNotifyPicker({
        owner: {
          id: selectedHumanId,
          fullName:
            owner?.fullName ||
            `${owner?.name || ""} ${owner?.surname || ""}`.trim() ||
            "Owner",
        },
        trusted: ownerTrusted
          .filter((c) => c.id)
          .map((c) => ({ id: c.id, fullName: c.fullName, relationship: c.relationship })),
      });
      return;
    }

    runSaveFlow();
  };

  // Past-date guard, then save. Split out so the recipient picker can run first
  // and then resume the normal save path.
  const runSaveFlow = () => {
    const todayStr = toDateStr(new Date());
    if (selectedDateStr < todayStr) {
      setPendingPastConfirm(true);
      return;
    }
    saveBooking();
  };

  // Resolve the recipient picker: store the chosen ids (owner-only collapses to
  // the default — leave the ref empty so no redundant notify_human_ids is sent),
  // then resume the save flow.
  const confirmNotifyRecipients = (selectedIds) => {
    const ownerId = pendingNotifyPicker?.owner?.id;
    const ownerOnly =
      selectedIds.length === 0 ||
      (selectedIds.length === 1 && selectedIds[0] === ownerId);
    notifyHumanIdsRef.current = ownerOnly ? [] : selectedIds;
    setPendingNotifyPicker(null);
    runSaveFlow();
  };

  const buildBookingsForOverride = (capacity) => {
    const result = [];
    const occurrences = recurringWeeks > 0 ? Math.floor(52 / recurringWeeks) : 1;
    const baseDate = new Date(selectedDateStr + "T00:00:00");

    for (let i = 0; i < occurrences; i++) {
      const targetDate = new Date(baseDate);
      targetDate.setDate(baseDate.getDate() + (i * recurringWeeks * 7));
      const targetDateStr = toDateStr(targetDate);

      if (!isDateOpen(targetDateStr, dayOpenState)) {
        if (i === 0) {
          return {
            error: "We're closed that day. Open it in day view or pick a different date.",
            targetDateStr,
            bareError: true,
          };
        }
        continue;
      }

      const dayBookings = bookingsByDate?.[targetDateStr] || [];
      const settings = daySettings?.[targetDateStr];
      const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
      let simulated = [...dayBookings];

      let allFit = true;
      let failureReason = "";

      // Staff-blocked seats (day_settings.overrides) must gate the save the
      // same way they gate the picker — otherwise a slot shown as "over" would
      // save silently into a blocked seat without the override confirm dialog.
      const slotOverrides = settings?.overrides?.[selectedSlot] || {};
      for (const entry of dogEntries) {
        const size = entry.dog.size || "small";
        const check = canBookSlot(simulated, selectedSlot, size, activeSlots, {
          overrides: slotOverrides,
          dogId: entry.dog.id,
          staffOverride: capacity
            ? { approval: true, capacity: true }
            : true,
        });
        if (!check.allowed) {
          allFit = false;
          failureReason = check.reason;
          break;
        }
        simulated = [
          ...simulated,
          { slot: selectedSlot, size, id: `check-${entry.dog.id}`, _dogId: entry.dog.id },
        ];
      }

      if (allFit) {
        dogEntries.forEach(entry => {
          result.push({
            id: crypto.randomUUID(),
            slot: selectedSlot,
            dogName: entry.dog.name,
            breed: entry.dog.breed,
            size: entry.dog.size || "small",
            service: entry.service,
            addons: entry.addons || [],
            owner: entry.dog.humanId,
            _dogId: entry.dog.id,
            _bookingDate: targetDateStr,
            ...(capacity ? { staff_capacity_override: true } : {}),
            ...(notifyHumanIdsRef.current?.length
              ? { notify_human_ids: notifyHumanIdsRef.current }
              : {}),
          });
        });
      } else if (i === 0) {
        return { error: failureReason, targetDateStr };
      }
      // i > 0: silently skip (today's behaviour)
    }

    return { bookings: result };
  };

  // Persist the built bookings, then report honestly. onAdd now awaits the real
  // DB insert and resolves { ok, error }: we only toast "Booking created" and
  // close once the database has accepted it. A late rejection — e.g. a
  // capacity/duplicate race after the client preflight — surfaces in-modal so
  // staff can pick another slot, instead of a green toast that lied while the
  // optimistic row was quietly rolled back off the calendar.
  const commitBookings = async (bookings) => {
    const res = await onAdd(bookings, selectedDateStr);
    if (res?.ok) {
      // Offer a one-tap path to a second booking for the same owner so the next
      // date (e.g. another dog another day) doesn't start from a cold search.
      // The wizard still closes here; the offer rides on the toast action.
      const owner = selectedHumanId
        ? Object.values(humans || {}).find((h) => h?.id === selectedHumanId)
        : null;
      const ownerFirstName =
        owner?.name || owner?.fullName?.split(" ")[0] || "this customer";
      if (onBookAnother && selectedHumanId) {
        toast.show("Booking saved — nice one", "success", {
          label: `Book another for ${ownerFirstName}`,
          onClick: () => onBookAnother(selectedHumanId),
        });
      } else {
        toast.show("Booking saved — nice one", "success");
      }
      onClose();
    } else {
      setError(res?.error || "That didn't quite work — let's try again");
    }
  };

  const saveBooking = async () => {
    // initialStaffCapacityOverride short-circuits the in-modal popup: the
    // day-view already asked "this slot is full, override and book?" and
    // the user confirmed. Going straight to capacity-override mode avoids
    // a second confirm.
    const outcome = buildBookingsForOverride(initialStaffCapacityOverride);
    if (outcome.error) {
      if (!initialStaffCapacityOverride && isCapacityRejection(outcome.error)) {
        setPendingCapacityOverride({ reason: outcome.error, targetDateStr: outcome.targetDateStr });
        return;
      }
      setError(
        outcome.bareError
          ? outcome.error
          : `Booking on ${outcome.targetDateStr} failed: ${outcome.error} (Choose a different starting date)`
      );
      return;
    }

    await commitBookings(outcome.bookings);
  };

  const confirmCapacityOverride = async () => {
    const outcome = buildBookingsForOverride(true);
    setPendingCapacityOverride(null);

    if (outcome.error) {
      // Override didn't help (e.g. a data-integrity reason or the recurring
      // week-1 still fails for some other reason). Fall back to hard error.
      setError(
        outcome.bareError
          ? outcome.error
          : `Booking on ${outcome.targetDateStr} failed: ${outcome.error} (Choose a different starting date)`
      );
      return;
    }

    await commitBookings(outcome.bookings);
  };

  // Format the selected date nicely (long form for the form label).
  const selectedDateDisplay = selectedDateStr
    ? (() => {
        const [y, m, d] = selectedDateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      })()
    : "";

  // Short form for the header subtitle ("Mon 11 May") so the user can
  // always see which slot they're booking into without scrolling.
  const selectedDateShort = selectedDateStr
    ? (() => {
        const [y, m, d] = selectedDateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      })()
    : "";

  // Slot label without the leading zero — "10:30am" reads better than "10:30".
  const selectedSlotLabel = selectedSlot
    ? (() => {
        const [h, mn] = selectedSlot.split(":").map(Number);
        const suffix = h >= 12 ? "pm" : "am";
        const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        return `${hour}:${String(mn).padStart(2, "0")}${suffix}`;
      })()
    : "";

  const subtitleParts = [];
  if (hasDogs) subtitleParts.push(dogEntries.map(e => titleCase(e.dog.name)).join(", "));
  if (selectedSlotLabel) subtitleParts.push(selectedSlotLabel);
  if (selectedDateShort) subtitleParts.push(selectedDateShort);
  const headerSubtitle = subtitleParts.length > 0
    ? subtitleParts.join(" · ")
    : "Search for a dog to get started";

  // ─── render ─────────────────────────────────────────────────────────────

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="new-booking-title"
      className="bg-[var(--color-brand-paper)] rounded-[20px] w-[min(440px,95vw)] max-h-[92vh] flex flex-col animate-shell-in shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)] max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none"
      backdropClass="bg-[rgba(45,0,75,0.45)] animate-overlay-fade"
    >
        {/* Header */}
        <div
          className="px-6 py-[18px] rounded-t-[20px] max-sm:rounded-t-none flex justify-between items-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${primaryTheme.gradient[0]}, ${primaryTheme.gradient[1]})` }}
        >
          <div>
            <div id="new-booking-title" className="text-lg font-extrabold" style={{ color: primaryTheme.headerText }}>New Booking</div>
            <div
              className="text-xs mt-0.5"
              style={{ color: primaryTheme.headerTextSub }}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {headerSubtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new booking"
            className="tap-target bg-white/20 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-base font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            style={{ color: primaryTheme.headerText }}
          ><span aria-hidden="true">{"\u00D7"}</span></button>
        </div>

        {/* ─── WhatsApp context banner ─── */}
        {sourceMessageText && (
          <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span className="font-bold">From WhatsApp:</span> "{sourceMessageText.slice(0, 140)}"
          </div>
        )}

        {/* ─── Dog search / selection ─── */}
        <DogSearchSection
          dogs={dogs}
          humans={humans}
          dogsByHumanId={dogsByHumanId}
          ensureDogsForHumans={ensureDogsForHumans}
          dogEntries={dogEntries}
          dogQuery={dogQuery}
          setDogQuery={setDogQuery}
          selectedHumanKey={selectedHumanKey}
          selectedHumanId={selectedHumanId}
          addingAnotherDog={addingAnotherDog}
          setAddingAnotherDog={setAddingAnotherDog}
          primaryTheme={primaryTheme}
          onSelectEntry={handleSelectEntry}
          onAddAnotherDog={handleAddAnotherDog}
          onRemoveDog={handleRemoveDog}
          onServiceChange={handleServiceChange}
          onAddonsChange={handleAddonsChange}
          onClearAll={handleClearAll}
          onOpenAddDog={handleOpenAddDog}
          onOpenAddHuman={handleOpenAddHuman}
          onSearchDogs={onSearchDogs}
          isSearchingDogs={isSearchingDogs}
          setError={setError}
        />

        {/* ─── Date, time, recurring, actions ─── */}
        <BookingFormFields
          hasDogs={hasDogs}
          dogEntries={dogEntries}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          daySettings={daySettings}
          selectedDateStr={selectedDateStr}
          selectedDateDisplay={selectedDateDisplay}
          selectedSlot={selectedSlot}
          selectedDogs={selectedDogs}
          recurringWeeks={recurringWeeks}
          setRecurringWeeks={setRecurringWeeks}
          primaryTheme={primaryTheme}
          error={error}
          onSelectDate={handleSelectDate}
          onSelectSlot={handleSelectSlot}
          onConfirm={handleConfirm}
          onClose={onClose}
        />

        {pendingPastConfirm && (
          <ConfirmDialog
            title="Log a historical booking?"
            message={`${selectedDateDisplay || "This date"}${selectedSlotLabel ? ` at ${selectedSlotLabel}` : ""} is in the past — save anyway to keep the record?`}
            confirmLabel="Log as historical"
            cancelLabel="Cancel"
            variant="primary"
            onConfirm={() => { setPendingPastConfirm(false); saveBooking(); }}
            onCancel={() => setPendingPastConfirm(false)}
          />
        )}

        {pendingCapacityOverride && (
          <ConfirmDialog
            title="This booking breaks the capacity rule"
            message={`${pendingCapacityOverride.reason}. Override the capacity rule and book anyway?`}
            confirmLabel="Override and book"
            cancelLabel="Pick another time"
            variant="primary"
            onConfirm={confirmCapacityOverride}
            onCancel={() => setPendingCapacityOverride(null)}
          />
        )}

        {pendingNotifyPicker && (
          <NotifyRecipientsDialog
            owner={pendingNotifyPicker.owner}
            trusted={pendingNotifyPicker.trusted}
            onConfirm={confirmNotifyRecipients}
            onCancel={() => setPendingNotifyPicker(null)}
          />
        )}
    </AccessibleModal>
  );
}

