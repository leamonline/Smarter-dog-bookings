import { useState, useMemo } from "react";
import { SERVICES, SIZE_THEME, getSizeForBreed } from "../../constants/index.js";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { IconSearch } from "../icons/index.jsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text.js";
import { waLink, telLink } from "./dog-card/helpers.js";

function HumanBookingHistory({ human, dogs, bookingsByDate }) {
  const history = useMemo(() => {
    if (!bookingsByDate || !human) return [];

    const humanDogNames = new Set(
      Object.values(dogs || {})
        .filter((dog) => {
          const dogOwnerId = dog._humanId || null;
          const dogOwnerName = dog.humanId || "";
          return dogOwnerId === human.id || dogOwnerName === human.fullName;
        })
        .map((dog) => dog.name),
    );

    const entries = [];
    for (const [dateStr, bookings] of Object.entries(bookingsByDate)) {
      for (const booking of bookings) {
        if (
          humanDogNames.has(booking.dogName) ||
          booking._ownerId === human.id ||
          booking.owner === human.fullName
        ) {
          entries.push({ ...booking, date: dateStr });
        }
      }
    }

    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [human, dogs, bookingsByDate]);

  if (history.length === 0) return null;

  return (
    <>
      <div className="mt-5 font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2">
        Recent Bookings
      </div>
      {history.slice(0, 5).map((booking, i) => {
        const service = SERVICES.find((s) => s.id === booking.service);
        return (
          <div
            key={`${booking.id || booking.date}-${i}`}
            className="flex justify-between items-center py-1.5 border-b border-slate-200 text-xs"
          >
            <div>
              <span className="font-semibold text-slate-800">
                {booking.date}
              </span>
              <span className="text-slate-500 ml-1.5">
                {titleCase(booking.dogName)}
              </span>
              <span className="text-slate-500 ml-1">
                {service?.icon} {service?.name}
              </span>
            </div>
            <span
              className="font-semibold text-[11px]"
              style={{
                color:
                  booking.status === "Ready for pick-up"
                    ? "#16A34A"
                    : "#6B7280",
              }}
            >
              {booking.status}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function HumanCardModal({
  humanId,
  onClose,
  onOpenHuman,
  onOpenDog,
  humans,
  dogs,
  onUpdateHuman,
  onAddHuman,
  bookingsByDate,
}) {
  const toast = useToast();

  const human = getHumanByIdOrName(humans, humanId) || {
    id: humanId,
    fullName: humanId,
    name: humanId,
    surname: "",
    phone: "",
    sms: false,
    whatsapp: false,
    email: "",
    fb: "",
    insta: "",
    tiktok: "",
    address: "",
    notes: "",
    trustedIds: [],
    historyFlag: "",
  };

  const humanFullName =
    human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();

  const humanDogs = useMemo(() => {
    return Object.values(dogs || {})
      .filter((dog) => {
        const dogOwnerId = dog._humanId || null;
        const dogOwnerName = dog.humanId || "";
        return dogOwnerId === human.id || dogOwnerName === humanFullName;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, human.id, humanFullName]);

  // Dogs this human is trusted to drop off / pick up (owned by their trusted humans)
  const trustedDogs = useMemo(() => {
    const trustedIds = human.trustedIds || [];
    if (trustedIds.length === 0) return [];

    const trustedSet = new Set(trustedIds);
    return Object.values(dogs || {})
      .filter((dog) => {
        const ownerId = dog._humanId || null;
        const ownerName = dog.humanId || "";
        // Must belong to a trusted human, not to this human
        if (ownerId === human.id || ownerName === humanFullName) return false;
        return trustedSet.has(ownerId) || trustedSet.has(ownerName);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, human.id, humanFullName, human.trustedIds]);

  const [showTrustedSearch, setShowTrustedSearch] = useState(false);
  const [trustedSearchQuery, setTrustedSearchQuery] = useState("");
  const [showNewTrustedForm, setShowNewTrustedForm] = useState(false);
  const [newTrustedName, setNewTrustedName] = useState("");
  const [newTrustedSurname, setNewTrustedSurname] = useState("");
  const [newTrustedPhone, setNewTrustedPhone] = useState("");

  const trustedSearchResults = useMemo(() => {
    if (!trustedSearchQuery.trim()) return [];

    const query = trustedSearchQuery.toLowerCase().trim();
    const currentTrusted = human.trustedIds || [];

    return Object.values(humans || {})
      .filter((candidate) => candidate.id !== human.id)
      .filter((candidate) => {
        const candidateFullName =
          candidate.fullName ||
          `${candidate.name || ""} ${candidate.surname || ""}`.trim();
        return (
          !currentTrusted.includes(candidate.id) &&
          !currentTrusted.includes(candidateFullName)
        );
      })
      .filter((candidate) => {
        const fullName =
          candidate.fullName ||
          `${candidate.name || ""} ${candidate.surname || ""}`.trim();
        return `${fullName} ${candidate.phone || ""}`
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 5);
  }, [trustedSearchQuery, humans, human.id, human.trustedIds]);

  const handleAddTrusted = async (selectedHumanId) => {
    const currentTrusted = human.trustedIds || [];
    const myId = human.id || humanId;

    // Step 1: Add them to our trusted list
    await onUpdateHuman(myId, {
      trustedIds: [...currentTrusted, selectedHumanId],
    });

    // Step 2: Add us to their trusted list
    const selectedHuman = getHumanByIdOrName(humans, selectedHumanId);
    if (selectedHuman) {
      const theirTrusted = selectedHuman.trustedIds || [];
      if (!theirTrusted.includes(myId)) {
        try {
          await onUpdateHuman(selectedHuman.id || selectedHumanId, {
            trustedIds: [...theirTrusted, myId],
          });
        } catch {
          // Step 2 failed — roll back step 1 to prevent one-directional trust
          onUpdateHuman(myId, {
            trustedIds: currentTrusted,
          });
          console.error("Failed to create bidirectional trust; rolled back.");
        }
      }
    }

    setTrustedSearchQuery("");
    setShowTrustedSearch(false);
    toast.show("Trusted human linked", "success");
  };

  const handleAddNewTrusted = async () => {
    if (!newTrustedName.trim() || !onAddHuman) return;
    try {
      const result = await onAddHuman({
        name: newTrustedName.trim(),
        surname: newTrustedSurname.trim(),
        phone: newTrustedPhone.trim(),
      });
      const newId = result?.id || result?.[0]?.id;
      if (newId) {
        const myId = human.id || humanId;
        const currentTrusted = human.trustedIds || [];
        await onUpdateHuman(myId, {
          trustedIds: [...currentTrusted, newId],
        });
        try {
          await onUpdateHuman(newId, {
            trustedIds: [myId],
          });
        } catch {
          console.error("Failed to add bidirectional trust for new human");
        }
      }
      setShowNewTrustedForm(false);
      setNewTrustedName("");
      setNewTrustedSurname("");
      setNewTrustedPhone("");
      setShowTrustedSearch(false);
      toast.show("Trusted human added", "success");
    } catch (err) {
      console.error("Failed to create new trusted human:", err);
    }
  };

  const detailRow = (label, value) => (
    <div className="flex justify-between py-2 border-b border-slate-200">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span className="text-[13px] font-semibold text-slate-800 text-right">
        {value || "\u2014"}
      </span>
    </div>
  );

  const contactRow = (label, active) => (
    <div className="flex justify-between py-2 border-b border-slate-200">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span
        className="text-[13px] font-semibold"
        style={{ color: active ? "#2D8B7A" : "#E8567F" }}
      >
        {active ? "\u2705 Active" : "\u274C Off"}
      </span>
    </div>
  );

  const PILL_FALLBACK = { light: "#E5E7EB", primary: "#6B7280" };

  const DogPill = ({ dog }) => {
    const dogSize = dog.size || getSizeForBreed(dog.breed);
    const theme = SIZE_THEME[dogSize] || PILL_FALLBACK;
    const colours = { bg: theme.light, text: theme.primary };
    const hasAlerts = dog.alerts && dog.alerts.length > 0;
    return (
      <span
        onClick={() => { onClose(); onOpenDog && onOpenDog(dog.id || dog.name); }}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer text-xs font-bold transition-opacity hover:opacity-80"
        style={{ background: colours.bg, color: colours.text }}
      >
        {hasAlerts && "\u26A0\uFE0F "}{titleCase(dog.name)} · {titleCase(dog.breed)}
      </span>
    );
  };

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="human-card-title"
      className="bg-white rounded-2xl w-[min(380px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
        <div
          className="px-6 py-5 rounded-t-2xl flex justify-between items-start"
          style={{ background: "linear-gradient(135deg, #2D8B7A, #236b5d)" }}
        >
          <div>
            <div id="human-card-title" className="text-xl font-extrabold text-white">
              {titleCase(humanFullName)}
            </div>
            {human.phone ? (
              <div className="flex items-center gap-2 mt-1">
                <a
                  href={telLink(human.phone)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[13px] no-underline transition-colors hover:text-white"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {human.phone}
                </a>
                <a
                  href={waLink(human.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-bold no-underline transition-colors hover:text-white"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                  title="WhatsApp"
                >
                  WA
                </a>
              </div>
            ) : (
              <div className="text-[13px] text-white/50 mt-1 italic">
                No phone
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm text-white font-bold shrink-0"
          >
            {"\u00D7"}
          </button>
        </div>

        <div className="px-6 pt-4 pb-5">
          {detailRow("Address", human.address)}
          {detailRow("Email", human.email)}
          {contactRow("SMS", human.sms)}
          {contactRow("WhatsApp", human.whatsapp)}
          {detailRow("Facebook", human.fb)}
          {detailRow("Instagram", human.insta)}
          {detailRow("TikTok", human.tiktok)}
          {detailRow("Notes", human.notes)}

          {human.historyFlag && (
            <div className="text-[13px] text-brand-coral font-bold bg-brand-coral-light px-3 py-2 rounded-lg mt-3">
              {"\u26A0\uFE0F"} {human.historyFlag}
            </div>
          )}

          {/* DOGS (own dogs) */}
          {humanDogs.length > 0 && (
            <>
              <div className="mt-5 font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2">
                Dogs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {humanDogs.map(dog => <DogPill key={dog.id} dog={dog} />)}
              </div>
            </>
          )}

          {/* DOGS TRUSTED WITH */}
          {trustedDogs.length > 0 && (
            <>
              <div className="mt-5 font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2">
                Dogs Trusted With
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trustedDogs.map(dog => <DogPill key={dog.id} dog={dog} />)}
              </div>
            </>
          )}

          {/* If neither section has dogs */}
          {humanDogs.length === 0 && trustedDogs.length === 0 && (
            <>
              <div className="mt-5 font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2">
                Dogs
              </div>
              <div className="text-[13px] text-slate-500 italic">
                No dogs linked
              </div>
            </>
          )}

          <div className="mt-5 font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2">
            Trusted Humans
          </div>
          {human.trustedIds && human.trustedIds.length > 0 ? (
            human.trustedIds.map((trustedId) => {
              const trustedHuman = getHumanByIdOrName(humans, trustedId);
              const trustedLabel =
                trustedHuman?.fullName ||
                `${trustedHuman?.name || ""} ${trustedHuman?.surname || ""}`.trim() ||
                trustedId;

              return (
                <div
                  key={trustedId}
                  onClick={() => {
                    onClose();
                    onOpenHuman && onOpenHuman(trustedHuman?.id || trustedId);
                  }}
                  className="py-2 border-b border-slate-200 text-[13px] font-semibold text-brand-teal cursor-pointer"
                >
                  {titleCase(trustedLabel)}
                </div>
              );
            })
          ) : (
            <div className="text-[13px] text-slate-500 italic">
              None listed
            </div>
          )}

          <button
            onClick={() => setShowTrustedSearch(!showTrustedSearch)}
            className="w-full mt-3 py-2.5 rounded-[10px] border-[1.5px] border-dashed border-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all"
            style={{
              background: showTrustedSearch ? "#2D8B7A" : "#E6F5F2",
              color: showTrustedSearch ? "#FFFFFF" : "#2D8B7A",
            }}
          >
            {showTrustedSearch ? "Cancel" : "+ Add a trusted Human"}
          </button>

          {/* Reminder Preferences */}
          <div className="mt-5 font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2">
            Reminder Preferences
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-slate-600">Timing</span>
              <select
                value={human.reminderHours ?? 24}
                onChange={(e) => onUpdateHuman(human.id, { reminderHours: Number(e.target.value) })}
                className="py-1 px-2 rounded-md border border-slate-200 text-[13px] font-inherit cursor-pointer"
              >
                <option value={24}>24 hours before</option>
                <option value={12}>12 hours before</option>
                <option value={2}>2 hours before</option>
              </select>
            </div>
            {[
              { key: "whatsapp", label: "WhatsApp" },
              { key: "sms", label: "SMS" },
              { key: "email", label: "Email" },
            ].map(({ key, label }) => {
              const channels = human.reminderChannels || ["whatsapp"];
              const active = channels.includes(key);
              return (
                <label key={key} className="flex items-center justify-between py-1.5 cursor-pointer">
                  <span className="text-[13px] text-slate-600">{label}</span>
                  <div
                    role="switch"
                    aria-checked={active}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        const next = active ? channels.filter((c) => c !== key) : [...channels, key];
                        onUpdateHuman(human.id, { reminderChannels: next.length > 0 ? next : ["whatsapp"] });
                      }
                    }}
                    onClick={() => {
                      const next = active ? channels.filter((c) => c !== key) : [...channels, key];
                      onUpdateHuman(human.id, { reminderChannels: next.length > 0 ? next : ["whatsapp"] });
                    }}
                    className={`w-9 h-5 rounded-full relative transition-colors ${active ? "bg-brand-teal" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? "left-[18px]" : "left-0.5"}`} />
                  </div>
                </label>
              );
            })}
          </div>

          <HumanBookingHistory
            human={human}
            dogs={dogs}
            bookingsByDate={bookingsByDate}
          />

          {showTrustedSearch && (
            <div className="mt-2.5">
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex pointer-events-none">
                  <IconSearch size={14} colour="#6B7280" />
                </div>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={trustedSearchQuery}
                  onChange={(e) => setTrustedSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full py-2 px-2.5 pl-8 rounded-lg border-[1.5px] border-brand-teal text-[13px] font-inherit box-border outline-none text-slate-800"
                />
              </div>

              {trustedSearchResults.length > 0 && (
                <div className="mt-1.5 border border-slate-200 rounded-lg overflow-hidden">
                  {trustedSearchResults.map((candidate) => {
                    const fullName =
                      candidate.fullName ||
                      `${candidate.name || ""} ${candidate.surname || ""}`.trim();

                    return (
                      <div
                        key={candidate.id}
                        onClick={() => handleAddTrusted(candidate.id)}
                        className="px-3 py-2.5 cursor-pointer border-b border-slate-200 transition-colors hover:bg-[#E6F5F2]"
                      >
                        <div className="text-[13px] font-semibold text-slate-800">
                          {titleCase(fullName)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {candidate.phone}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {trustedSearchQuery.trim() &&
                trustedSearchResults.length === 0 && (
                  <div className="text-xs text-slate-500 mt-2 text-center">
                    No matching humans found
                  </div>
                )}

              {onAddHuman && !showNewTrustedForm && (
                <button
                  onClick={() => setShowNewTrustedForm(true)}
                  className="w-full mt-2.5 py-2.5 rounded-[10px] border-[1.5px] border-dashed border-brand-teal bg-[#E6F5F2] text-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all hover:bg-brand-teal hover:text-white"
                >
                  + Create new human
                </button>
              )}

              {showNewTrustedForm && (
                <div className="mt-2.5 p-3.5 bg-slate-50 rounded-[10px] border border-slate-200">
                  <div className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide mb-2.5">
                    New Trusted Human
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="First name"
                      value={newTrustedName}
                      onChange={(e) => setNewTrustedName(e.target.value)}
                      autoFocus
                      className="flex-1 py-2 px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
                    />
                    <input
                      type="text"
                      placeholder="Surname"
                      value={newTrustedSurname}
                      onChange={(e) => setNewTrustedSurname(e.target.value)}
                      className="flex-1 py-2 px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
                    />
                  </div>
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={newTrustedPhone}
                    onChange={(e) => setNewTrustedPhone(e.target.value)}
                    className="w-full py-2 px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none box-border text-slate-800 mb-2.5 transition-colors focus:border-brand-teal"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddNewTrusted}
                      disabled={!newTrustedName.trim()}
                      className="flex-1 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit transition-colors disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed bg-brand-teal text-white"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowNewTrustedForm(false);
                        setNewTrustedName("");
                        setNewTrustedSurname("");
                        setNewTrustedPhone("");
                      }}
                      className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-bold cursor-pointer font-inherit bg-white text-slate-500 transition-colors hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </AccessibleModal>
  );
}
