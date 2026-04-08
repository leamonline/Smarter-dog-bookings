import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { ALERT_OPTIONS, SERVICES, SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { IconEdit, IconTick, IconSearch } from "../icons/index.jsx";

const ChainBookingModal = lazy(() =>
  import("./ChainBookingModal.jsx").then((m) => ({ default: m.ChainBookingModal })),
);

function GroomingHistory({ dogId, fetchBookingHistoryForDog, accentColour }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dogId || !fetchBookingHistoryForDog) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBookingHistoryForDog(dogId)
      .then((data) => {
        if (!cancelled) {
          setHistory(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("GroomingHistory fetch error:", err);
          setError(err.message || "Unknown error");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [dogId, fetchBookingHistoryForDog]);

  const completed = useMemo(
    () => history.filter((b) => b.status === "Completed"),
    [history],
  );

  const lastVisitWeeksAgo = useMemo(() => {
    if (completed.length === 0) return null;
    const lastDate = new Date(completed[0].date);
    const now = new Date();
    const diffMs = now - lastDate;
    return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  }, [completed]);

  const frequencyRange = useMemo(() => {
    if (completed.length < 2) return null;
    const gaps = [];
    for (let i = 0; i < completed.length - 1; i++) {
      const a = new Date(completed[i].date);
      const b = new Date(completed[i + 1].date);
      const diffWeeks = Math.round(Math.abs(a - b) / (7 * 24 * 60 * 60 * 1000));
      if (diffWeeks > 0) gaps.push(diffWeeks);
    }
    if (gaps.length === 0) return null;
    const min = Math.min(...gaps);
    const max = Math.max(...gaps);
    return { min, max, avg: Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) };
  }, [completed]);

  const isOverdue = useMemo(() => {
    if (lastVisitWeeksAgo === null || frequencyRange === null) return false;
    return lastVisitWeeksAgo > frequencyRange.max + 1;
  }, [lastVisitWeeksAgo, frequencyRange]);

  const handleRetry = () => {
    if (!dogId || !fetchBookingHistoryForDog) return;
    setLoading(true);
    setError(null);
    fetchBookingHistoryForDog(dogId)
      .then((data) => { setHistory(data); setLoading(false); })
      .catch((err) => { setError(err.message || "Unknown error"); setLoading(false); });
  };

  return (
    <div className="px-6 mt-2">
      <div
        className="mt-4 font-extrabold text-xs uppercase tracking-wide mb-2"
        style={{ color: accentColour || "#0099BD" }}
      >
        Grooming History
      </div>

      {loading && (
        <div className="text-xs text-slate-500 pb-2">
          Loading...
        </div>
      )}

      {!loading && error && (
        <div
          onClick={handleRetry}
          className="text-xs text-brand-coral cursor-pointer pb-2"
        >
          Couldn't load history. Tap to retry.
        </div>
      )}

      {!loading && !error && (
        <>
          {lastVisitWeeksAgo !== null && (
            <div className="text-xs text-slate-500 mb-1">
              {isOverdue ? (
                <span className="text-brand-coral font-bold">
                  Overdue — last visit was {lastVisitWeeksAgo} week{lastVisitWeeksAgo !== 1 ? "s" : ""} ago
                </span>
              ) : (
                <span>
                  Last visit:{" "}
                  <span className="font-semibold text-slate-800">
                    {lastVisitWeeksAgo} week{lastVisitWeeksAgo !== 1 ? "s" : ""} ago
                  </span>
                </span>
              )}
            </div>
          )}

          {frequencyRange && (
            <div className="text-xs text-slate-500 mb-2">
              Usually every{" "}
              <span className="font-semibold text-slate-800">
                {frequencyRange.min === frequencyRange.max
                  ? `${frequencyRange.min} week${frequencyRange.min !== 1 ? "s" : ""}`
                  : `${frequencyRange.min}–${frequencyRange.max} weeks`}
              </span>
            </div>
          )}

          {history.length === 0 ? (
            <div className="text-xs text-slate-500 pb-2">
              No previous visits recorded.
            </div>
          ) : (
            history.map((b, i) => {
              const svc = SERVICES.find((s) => s.id === b.service);
              return (
                <div
                  key={`${b.date}-${b.id || b.slot}-${i}`}
                  className="flex justify-between items-center py-1.5 border-b border-slate-200 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-800">
                      {b.date?.split("-").reverse().join("-")}
                    </span>
                    <span className="text-slate-500 ml-1.5">
                      {svc?.icon} {svc?.name || b.service}
                    </span>
                  </div>
                  <span
                    className="font-semibold text-[11px]"
                    style={{
                      color: b.status === "Completed" ? "#16A34A" : undefined,
                    }}
                  >
                    {b.status}
                  </span>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function waLink(phone) {
  if (!phone) return "#";
  const digits = phone.replace(/[\s\-()]/g, "");
  const intl = digits.startsWith("0") ? "44" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

export function DogCardModal({
  dogId,
  onClose,
  onOpenHuman,
  dogs,
  humans = {},
  onUpdateDog,
  onUpdateHuman,
  onAddHuman,
  bookingsByDate,
  fetchBookingHistoryForDog,
  handleAdd,
}) {
  const resolvedDog = getDogByIdOrName(dogs, dogId) || {
    id: dogId,
    name: dogId,
    breed: "",
    age: "",
    humanId: "",
    _humanId: null,
    alerts: [],
    groomNotes: "",
  };

  const owner =
    getHumanByIdOrName(humans, resolvedDog._humanId || resolvedDog.humanId) ||
    null;

  const ownerLabel = owner?.fullName || resolvedDog.humanId || "";
  const ownerOpenValue =
    owner?.id || resolvedDog._humanId || resolvedDog.humanId || null;

  const [isEditing, setIsEditing] = useState(false);
  const [showChainBooking, setShowChainBooking] = useState(false);

  const lastBooking = useMemo(() => {
    if (!resolvedDog?.id && !resolvedDog?.name) return null;
    const allBookings = Object.values(bookingsByDate || {}).flat();
    const dogBookings = allBookings.filter(
      (b) => b.dog_id === resolvedDog.id || b.dogName === resolvedDog.name,
    );
    if (dogBookings.length === 0) return null;
    return dogBookings.sort((a, b) => (b.booking_date || "").localeCompare(a.booking_date || ""))[0] || null;
  }, [resolvedDog, bookingsByDate]);

  const [editName, setEditName] = useState(resolvedDog.name || "");
  const [editBreed, setEditBreed] = useState(resolvedDog.breed || "");

  // DOB stored as "YYYY-MM", e.g. "2022-03"
  const existingDob = resolvedDog.dob || "";
  const [editDobMonth, setEditDobMonth] = useState(() => {
    if (existingDob) return existingDob.split("-")[1] || "";
    return "";
  });
  const [editDobYear, setEditDobYear] = useState(() => {
    if (existingDob) return existingDob.split("-")[0] || "";
    return "";
  });

  // Calculate age from DOB
  const calcAge = (dob) => {
    if (!dob) return null;
    const [y, m] = dob.split("-").map(Number);
    if (!y || !m) return null;
    const now = new Date();
    let years = now.getFullYear() - y;
    let months = now.getMonth() + 1 - m;
    if (months < 0) { years--; months += 12; }
    if (years >= 1) return `${years} ${years === 1 ? "yr" : "yrs"}`;
    return `${months} ${months === 1 ? "month" : "months"}`;
  };

  const displayAge = calcAge(resolvedDog.dob) || (() => {
    const raw = resolvedDog.age || "";
    if (!raw) return "";
    // If it's just a number with no unit, append "yrs"
    if (/^\d+$/.test(raw.trim())) return `${raw.trim()} yrs`;
    return raw;
  })();
  const [editOwnerId, setEditOwnerId] = useState(ownerOpenValue);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState("");
  const [showOwnerSearch, setShowOwnerSearch] = useState(false);
  const [editNotes, setEditNotes] = useState(resolvedDog.groomNotes || "");
  const [editAlerts, setEditAlerts] = useState([...(resolvedDog.alerts || [])]);

  const [allergyInput, setAllergyInput] = useState(() => {
    const allergy = (resolvedDog.alerts || []).find((a) =>
      a.startsWith("Allergic to "),
    );
    return allergy ? allergy.replace("Allergic to ", "") : "";
  });

  const [hasAllergy, setHasAllergy] = useState(() =>
    (resolvedDog.alerts || []).some((a) => a.startsWith("Allergic to ")),
  );

  // Trusted humans (from owner's trusted contacts)
  const [showTrustedSearch, setShowTrustedSearch] = useState(false);
  const [trustedSearchQuery, setTrustedSearchQuery] = useState("");
  const [showNewTrustedForm, setShowNewTrustedForm] = useState(false);
  const [newTrustedName, setNewTrustedName] = useState("");
  const [newTrustedSurname, setNewTrustedSurname] = useState("");
  const [newTrustedPhone, setNewTrustedPhone] = useState("");

  const trustedIds = owner?.trustedIds || [];

  const trustedSearchResults = useMemo(() => {
    if (!trustedSearchQuery.trim()) return [];
    const query = trustedSearchQuery.toLowerCase().trim();
    return Object.values(humans)
      .filter((h) => {
        if (!h || h.id === owner?.id) return false;
        if (trustedIds.includes(h.id) || trustedIds.includes(h.fullName)) return false;
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [trustedSearchQuery, humans, owner?.id, trustedIds]);

  const handleAddTrusted = async (selectedHumanId) => {
    if (!owner || !onUpdateHuman) return;
    const currentTrusted = owner.trustedIds || [];
    const ownerKey = owner.fullName || owner.id;

    // Add to owner's trusted list
    await onUpdateHuman(ownerKey, {
      trustedIds: [...currentTrusted, selectedHumanId],
    });

    // Bidirectional: add owner to their trusted list
    const selectedHuman = getHumanByIdOrName(humans, selectedHumanId);
    if (selectedHuman) {
      const theirTrusted = selectedHuman.trustedIds || [];
      const myId = owner.id || ownerKey;
      if (!theirTrusted.includes(myId)) {
        const theirKey = selectedHuman.fullName || selectedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedIds: [...theirTrusted, myId],
        });
      }
    }

    setTrustedSearchQuery("");
    setShowTrustedSearch(false);
  };

  const handleAddNewTrusted = async () => {
    if (!owner || !onAddHuman || !onUpdateHuman) return;
    const name = newTrustedName.trim();
    const surname = newTrustedSurname.trim();
    const phone = newTrustedPhone.trim();
    if (!name || !surname || !phone) return;

    const newHuman = await onAddHuman({ name, surname, phone });
    if (!newHuman) return;

    // Add to owner's trusted list
    const currentTrusted = owner.trustedIds || [];
    const ownerKey = owner.fullName || owner.id;
    await onUpdateHuman(ownerKey, {
      trustedIds: [...currentTrusted, newHuman.id],
    });

    // Bidirectional: add owner to new human's trusted list
    const newKey = newHuman.fullName || `${name} ${surname}`;
    await onUpdateHuman(newKey, {
      trustedIds: [owner.id || ownerKey],
    });

    setNewTrustedName("");
    setNewTrustedSurname("");
    setNewTrustedPhone("");
    setShowNewTrustedForm(false);
    setShowTrustedSearch(false);
  };

  const handleRemoveTrusted = async (trustedIdToRemove) => {
    if (!owner || !onUpdateHuman) return;
    const currentTrusted = owner.trustedIds || [];
    const ownerKey = owner.fullName || owner.id;

    // Remove from owner's trusted list
    await onUpdateHuman(ownerKey, {
      trustedIds: currentTrusted.filter((id) => id !== trustedIdToRemove),
    });

    // Bidirectional: remove owner from their trusted list
    const removedHuman = getHumanByIdOrName(humans, trustedIdToRemove);
    if (removedHuman) {
      const theirTrusted = removedHuman.trustedIds || [];
      const myId = owner.id || ownerKey;
      if (theirTrusted.includes(myId)) {
        const theirKey = removedHuman.fullName || removedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedIds: theirTrusted.filter((id) => id !== myId),
        });
      }
    }
  };

  // Owner search results
  const ownerSearchResults = useMemo(() => {
    if (!ownerSearchQuery.trim()) return [];
    const query = ownerSearchQuery.toLowerCase().trim();
    return Object.values(humans)
      .filter((h) => {
        if (!h) return false;
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [ownerSearchQuery, humans]);

  const editOwner = editOwnerId
    ? getHumanByIdOrName(humans, editOwnerId)
    : null;
  const editOwnerLabel = editOwner?.fullName || editOwnerId || "";

  const handleSave = async () => {
    const finalAlerts = editAlerts.filter((a) => !a.startsWith("Allergic to "));
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }
    const updates = {
      groomNotes: editNotes,
      alerts: finalAlerts,
    };
    if (editName.trim() && editName !== resolvedDog.name) updates.name = editName.trim();
    if (editBreed !== resolvedDog.breed) updates.breed = editBreed.trim();
    const composedDob = editDobYear && editDobMonth ? `${editDobYear}-${editDobMonth}` : "";
    if (composedDob !== (resolvedDog.dob || "")) {
      updates.dob = composedDob || null;
      // Also update the age string for backwards compatibility
      updates.age = calcAge(composedDob) || "";
    }
    if (editOwnerId !== ownerOpenValue) updates.humanId = editOwnerId;

    await onUpdateDog(resolvedDog.id || resolvedDog.name, updates);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(resolvedDog.name || "");
    setEditBreed(resolvedDog.breed || "");
    setEditDobMonth(existingDob ? existingDob.split("-")[1] || "" : "");
    setEditDobYear(existingDob ? existingDob.split("-")[0] || "" : "");
    setEditOwnerId(ownerOpenValue);
    setOwnerSearchQuery("");
    setShowOwnerSearch(false);
    setEditNotes(resolvedDog.groomNotes || "");
    setEditAlerts([...(resolvedDog.alerts || [])]);
    const allergy = (resolvedDog.alerts || []).find((a) =>
      a.startsWith("Allergic to "),
    );
    setAllergyInput(allergy ? allergy.replace("Allergic to ", "") : "");
    setHasAllergy(
      (resolvedDog.alerts || []).some((a) => a.startsWith("Allergic to ")),
    );
    setIsEditing(false);
  };

  const sizeTheme = SIZE_THEME[resolvedDog.size] || SIZE_FALLBACK;
  const sizeAccent = sizeTheme.primary;
  const headerTextColour = sizeTheme.headerText;
  const headerSubTextColour = sizeTheme.headerTextSub;

  const sectionLabelCls = "font-extrabold text-xs uppercase tracking-wide";

  const detailRow = (label, value) => (
    <div className="py-2 border-b border-slate-200">
      <span className={sectionLabelCls} style={{ color: sizeAccent }}>{label}</span>
      <div className="text-[13px] font-semibold text-slate-800 mt-1">
        {value || "\u2014"}
      </div>
    </div>
  );

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

  const displayAlerts = isEditing ? editAlerts : resolvedDog.alerts || [];

  return (
    <>
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-[min(360px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
      >
        <div
          className="px-6 py-5 rounded-t-2xl flex justify-between items-start"
          style={{
            background: `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`,
          }}
        >
          <div className="flex-1 mr-3">
            {isEditing ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Dog name"
                  className="text-xl font-extrabold bg-white/15 border border-white/30 rounded-lg px-2.5 py-1 w-full box-border outline-none font-inherit"
                  style={{ color: headerTextColour }}
                />
                <div className="flex gap-2 mt-1.5">
                  <input
                    value={editBreed}
                    onChange={(e) => setEditBreed(e.target.value)}
                    placeholder="Breed"
                    className="text-[13px] bg-white/15 border border-white/30 rounded-md px-2 py-[3px] flex-1 outline-none font-inherit"
                    style={{ color: headerTextColour }}
                  />
                  <span className="text-xs" style={{ color: headerSubTextColour }}>Born</span>
                  <select
                    value={editDobMonth}
                    onChange={(e) => setEditDobMonth(e.target.value)}
                    className="text-xs bg-white/15 border border-white/30 rounded-md px-1 py-[3px] outline-none font-inherit cursor-pointer"
                    style={{ color: headerTextColour }}
                  >
                    <option value="" className="text-slate-800">Month</option>
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                      <option key={m} value={String(i + 1).padStart(2, "0")} className="text-slate-800">{m}</option>
                    ))}
                  </select>
                  <select
                    value={editDobYear}
                    onChange={(e) => setEditDobYear(e.target.value)}
                    className="text-xs bg-white/15 border border-white/30 rounded-md px-1 py-[3px] outline-none font-inherit cursor-pointer"
                    style={{ color: headerTextColour }}
                  >
                    <option value="" className="text-slate-800">Year</option>
                    {Array.from({ length: 26 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={String(y)} className="text-slate-800">{y}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-extrabold" style={{ color: headerTextColour }}>
                  {titleCase(resolvedDog.name)}
                </div>
                <div
                  className="text-[13px] mt-1"
                  style={{ color: headerSubTextColour }}
                >
                  {titleCase(resolvedDog.breed)}{displayAge ? ` \u00b7 ${displayAge}` : ""}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold shrink-0"
            style={{ color: headerTextColour }}
          >
            {"\u00d7"}
          </button>
        </div>

        <div className="px-6 pt-4">
          {isEditing ? (
            <div className="py-2 border-b border-slate-200">
              <div className={`${sectionLabelCls} mb-1.5`} style={{ color: sizeAccent }}>Owner</div>
              <div
                onClick={() => setShowOwnerSearch(!showOwnerSearch)}
                className={`${inputCls} cursor-pointer flex justify-between items-center ${showOwnerSearch ? "bg-blue-50" : "bg-white"}`}
              >
                <span className="font-semibold">{editOwnerLabel || "Select owner..."}</span>
                <span className="text-[11px] text-slate-500">
                  {showOwnerSearch ? "\u25b2" : "\u25bc"}
                </span>
              </div>
              {showOwnerSearch && (
                <div className="mt-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex">
                      <IconSearch size={14} colour="#6B7280" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={ownerSearchQuery}
                      onChange={(e) => setOwnerSearchQuery(e.target.value)}
                      autoFocus
                      className={`${inputCls} pl-8 border-brand-blue`}
                    />
                  </div>
                  {ownerSearchResults.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden">
                      {ownerSearchResults.map((candidate) => {
                        const fullName = candidate.fullName || `${candidate.name || ""} ${candidate.surname || ""}`.trim();
                        return (
                          <div
                            key={candidate.id}
                            onClick={() => {
                              setEditOwnerId(candidate.id);
                              setOwnerSearchQuery("");
                              setShowOwnerSearch(false);
                            }}
                            className="px-3 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-blue-50"
                          >
                            <div className="text-[13px] font-semibold text-slate-800">{fullName}</div>
                            {candidate.phone && (
                              <div className="text-xs text-slate-500">{candidate.phone}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {ownerSearchQuery.trim() && ownerSearchResults.length === 0 && (
                    <div className="text-xs text-slate-500 mt-1.5 text-center">
                      No matching humans found
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-2 border-b border-slate-200">
              <div className={sectionLabelCls} style={{ color: sizeAccent }}>Owner</div>
              <div className="flex items-baseline gap-2 mt-1">
                <div
                  onClick={() => {
                    if (ownerOpenValue) {
                      onClose();
                      onOpenHuman && onOpenHuman(ownerOpenValue);
                    }
                  }}
                  className="text-[13px] font-semibold text-brand-teal"
                  style={{ cursor: ownerOpenValue ? "pointer" : "default" }}
                >
                  {titleCase(ownerLabel) || "\u2014"}
                </div>
                {owner?.phone && (
                  <a
                    href={waLink(owner.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-500 no-underline hover:text-brand-teal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {owner.phone}
                  </a>
                )}
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="py-2 border-b border-slate-200">
              <div className={`${sectionLabelCls} mb-1.5`} style={{ color: sizeAccent }}>
                Groom Notes
              </div>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className={`${inputCls} resize-y min-h-[60px]`}
              />
            </div>
          ) : (
            detailRow("Groom Notes", resolvedDog.groomNotes)
          )}

          {isEditing ? (
            <div className="mt-4">
              <div
                className={`${sectionLabelCls} mb-2.5 text-center`}
                style={{ color: sizeAccent }}
              >
                Alerts
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {ALERT_OPTIONS.map((opt) => {
                  const active = editAlerts.includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        if (active)
                          setEditAlerts(
                            editAlerts.filter((a) => a !== opt.label),
                          );
                        else setEditAlerts([...editAlerts, opt.label]);
                      }}
                      className="px-3 py-1.5 rounded-2xl text-xs font-bold cursor-pointer transition-all"
                      style={{
                        background: active ? opt.color : "#FFFFFF",
                        color: active ? "#FFFFFF" : opt.color,
                        border: `2px solid ${opt.color}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setHasAllergy(!hasAllergy)}
                  className="px-3 py-1.5 rounded-2xl text-xs font-bold cursor-pointer transition-all"
                  style={{
                    background: hasAllergy ? "#E8567F" : "#FFFFFF",
                    color: hasAllergy ? "#FFFFFF" : "#E8567F",
                    border: "2px solid #E8567F",
                  }}
                >
                  Allergy
                </button>
              </div>
              {hasAllergy && (
                <div className="mt-2.5 flex justify-center">
                  <input
                    type="text"
                    placeholder="Allergic to..."
                    value={allergyInput}
                    onChange={(e) => setAllergyInput(e.target.value)}
                    className={`${inputCls} text-center border-2 border-brand-coral`}
                  />
                </div>
              )}
            </div>
          ) : (
            displayAlerts.length > 0 && (
              <>
                <div
                  className={`${sectionLabelCls} mt-4 mb-2`}
                  style={{ color: sizeAccent }}
                >
                  Alerts
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {displayAlerts.map((alert) => (
                    <span
                      key={alert}
                      className="bg-brand-coral-light text-brand-coral px-3 py-1.5 rounded-lg text-xs font-bold"
                    >
                      {alert}
                    </span>
                  ))}
                </div>
              </>
            )
          )}
        </div>

        {/* Trusted Humans */}
        <div className="px-6 mt-3">
          <div className={`${sectionLabelCls} mb-2`} style={{ color: sizeAccent }}>
            Trusted Humans
          </div>
          {trustedIds.length > 0 ? (
            trustedIds.map((trustedId) => {
              const trustedHuman = getHumanByIdOrName(humans, trustedId);
              const trustedLabel =
                trustedHuman?.fullName ||
                `${trustedHuman?.name || ""} ${trustedHuman?.surname || ""}`.trim() ||
                trustedId;
              return (
                <div
                  key={trustedId}
                  className="py-2 border-b border-slate-200 flex items-center justify-between"
                >
                  <span
                    onClick={() => {
                      onClose();
                      onOpenHuman && onOpenHuman(trustedHuman?.id || trustedId);
                    }}
                    className="text-[13px] font-semibold text-brand-teal cursor-pointer"
                  >
                    {titleCase(trustedLabel)}
                  </span>
                  {isEditing && onUpdateHuman && (
                    <button
                      onClick={() => handleRemoveTrusted(trustedId)}
                      className="bg-transparent border-none text-brand-coral text-base font-bold cursor-pointer px-1 leading-none font-inherit"
                      title="Remove trusted human"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-[13px] text-slate-500 italic">
              None listed
            </div>
          )}

          {isEditing && onUpdateHuman && (
            <>
              <button
                onClick={() => setShowTrustedSearch(!showTrustedSearch)}
                className="w-full mt-2.5 py-2 rounded-[10px] border-[1.5px] border-dashed border-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all"
                style={{
                  background: showTrustedSearch ? "#2D8B7A" : "#E6F5F2",
                  color: showTrustedSearch ? "#FFFFFF" : "#2D8B7A",
                }}
              >
                {showTrustedSearch ? "Cancel" : "+ Add a trusted human"}
              </button>

              {showTrustedSearch && (
                <div className="mt-2">
                  <div className="relative">
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex">
                      <IconSearch size={14} colour="#6B7280" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={trustedSearchQuery}
                      onChange={(e) => setTrustedSearchQuery(e.target.value)}
                      autoFocus
                      className={`${inputCls} pl-8 border-brand-teal`}
                    />
                  </div>
                  {trustedSearchResults.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden">
                      {trustedSearchResults.map((candidate) => {
                        const fullName = candidate.fullName || `${candidate.name || ""} ${candidate.surname || ""}`.trim();
                        return (
                          <div
                            key={candidate.id}
                            onClick={() => handleAddTrusted(candidate.id)}
                            className="px-3 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-[#E6F5F2]"
                          >
                            <div className="text-[13px] font-semibold text-slate-800">{fullName}</div>
                            {candidate.phone && (
                              <div className="text-xs text-slate-500">{candidate.phone}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {trustedSearchQuery.trim() && trustedSearchResults.length === 0 && !showNewTrustedForm && (
                    <div className="text-xs text-slate-500 mt-1.5 text-center">
                      No matching humans found
                    </div>
                  )}
                  {onAddHuman && !showNewTrustedForm && (
                    <button
                      onClick={() => setShowNewTrustedForm(true)}
                      className="w-full mt-2 py-2 rounded-lg border-[1.5px] border-brand-teal bg-white text-brand-teal text-xs font-bold cursor-pointer font-inherit transition-all"
                    >
                      + Add new human
                    </button>
                  )}
                  {showNewTrustedForm && (
                    <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide mb-2">New Trusted Human</div>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          placeholder="First name"
                          value={newTrustedName}
                          onChange={(e) => setNewTrustedName(e.target.value)}
                          autoFocus
                          className={`${inputCls} flex-1`}
                        />
                        <input
                          type="text"
                          placeholder="Surname"
                          value={newTrustedSurname}
                          onChange={(e) => setNewTrustedSurname(e.target.value)}
                          className={`${inputCls} flex-1`}
                        />
                      </div>
                      <input
                        type="tel"
                        placeholder="Phone number"
                        value={newTrustedPhone}
                        onChange={(e) => setNewTrustedPhone(e.target.value)}
                        className={`${inputCls} w-full mb-2`}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddNewTrusted}
                          disabled={!newTrustedName.trim() || !newTrustedSurname.trim() || !newTrustedPhone.trim()}
                          className="flex-1 py-2 rounded-lg border-none bg-brand-teal text-white text-xs font-bold cursor-pointer font-inherit disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
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
                          className="flex-1 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-bold cursor-pointer font-inherit"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <GroomingHistory
          dogId={resolvedDog.id}
          fetchBookingHistoryForDog={fetchBookingHistoryForDog}
          accentColour={sizeAccent}
        />

        {lastBooking && (
          <div className="px-6">
            <button
              onClick={() => setShowChainBooking(true)}
              className="w-full py-2.5 rounded-[10px] border-none bg-brand-teal text-white text-[13px] font-bold cursor-pointer font-inherit transition-all hover:bg-[#1E6B5C] mt-2"
            >
              Recurring Bookings
            </button>
          </div>
        )}

        <div className="px-6 py-4 pb-5 flex gap-2.5 bg-slate-50 border-t border-slate-200 mt-4">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors"
                style={{
                  background: sizeTheme.gradient[0],
                  color: headerTextColour,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = sizeTheme.primary)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = sizeTheme.gradient[0])
                }
              >
                <IconTick size={16} colour={headerTextColour} /> Save
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-500 text-[13px] font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors"
              style={{
                background: sizeTheme.gradient[0],
                color: headerTextColour,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = sizeTheme.primary)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = sizeTheme.gradient[0])
              }
            >
              <IconEdit size={16} colour={headerTextColour} /> Edit
            </button>
          )}
        </div>
      </div>
    </div>

    {showChainBooking && lastBooking && (
      <Suspense fallback={null}>
        <ChainBookingModal
          dog={resolvedDog}
          lastBooking={lastBooking}
          onClose={() => setShowChainBooking(false)}
          onCreateChain={async (chain) => {
            const chainId = crypto.randomUUID();
            for (const link of chain) {
              await handleAdd({
                dogName: resolvedDog.name,
                dog_id: resolvedDog.id,
                breed: resolvedDog.breed,
                size: link.size,
                service: link.service,
                slot: link.slot,
                owner: owner?.id || resolvedDog.human_id || "",
                ownerName: owner
                  ? `${owner.first_name || owner.name || ""} ${owner.last_name || owner.surname || ""}`.trim()
                  : "",
                status: "Not Arrived",
                chain_id: chainId,
              }, link.dateStr);
            }
          }}
        />
      </Suspense>
    )}
    </>
  );
}
