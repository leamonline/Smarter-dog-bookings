import { useState, useEffect, useMemo } from "react";
import { BRAND, ALERT_OPTIONS, SERVICES } from "../../constants/index.js";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { IconEdit, IconTick, IconSearch } from "../icons/index.jsx";

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
    <div style={{ padding: "0 24px", marginTop: 8 }}>
      <div
        style={{
          marginTop: 16,
          fontWeight: 800,
          fontSize: 12,
          color: accentColour || BRAND.blueDark,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
        }}
      >
        Grooming History
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: BRAND.textLight, paddingBottom: 8 }}>
          Loading...
        </div>
      )}

      {!loading && error && (
        <div
          onClick={handleRetry}
          style={{
            fontSize: 12,
            color: BRAND.coral,
            cursor: "pointer",
            paddingBottom: 8,
          }}
        >
          Couldn't load history. Tap to retry.
        </div>
      )}

      {!loading && !error && (
        <>
          {lastVisitWeeksAgo !== null && (
            <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 4 }}>
              {isOverdue ? (
                <span style={{ color: BRAND.coral, fontWeight: 700 }}>
                  Overdue — last visit was {lastVisitWeeksAgo} week{lastVisitWeeksAgo !== 1 ? "s" : ""} ago
                </span>
              ) : (
                <span>
                  Last visit:{" "}
                  <span style={{ fontWeight: 600, color: BRAND.text }}>
                    {lastVisitWeeksAgo} week{lastVisitWeeksAgo !== 1 ? "s" : ""} ago
                  </span>
                </span>
              )}
            </div>
          )}

          {frequencyRange && (
            <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 8 }}>
              Usually every{" "}
              <span style={{ fontWeight: 600, color: BRAND.text }}>
                {frequencyRange.min === frequencyRange.max
                  ? `${frequencyRange.min} week${frequencyRange.min !== 1 ? "s" : ""}`
                  : `${frequencyRange.min}–${frequencyRange.max} weeks`}
              </span>
            </div>
          )}

          {history.length === 0 ? (
            <div style={{ fontSize: 12, color: BRAND.textLight, paddingBottom: 8 }}>
              No previous visits recorded.
            </div>
          ) : (
            history.map((b, i) => {
              const svc = SERVICES.find((s) => s.id === b.service);
              return (
                <div
                  key={`${b.date}-${b.id || b.slot}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 0",
                    borderBottom: `1px solid ${BRAND.greyLight}`,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: BRAND.text }}>
                      {b.date?.split("-").reverse().join("-")}
                    </span>
                    <span style={{ color: BRAND.textLight, marginLeft: 6 }}>
                      {svc?.icon} {svc?.name || b.service}
                    </span>
                  </div>
                  <span
                    style={{
                      fontWeight: 600,
                      color: b.status === "Completed" ? BRAND.openGreen : BRAND.textLight,
                      fontSize: 11,
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

  const sizeColourMap = {
    small: { from: "#F5C518", to: "#D4A500", text: "#5C4600", textSub: "rgba(60,40,0,0.65)" },
    medium: { from: "#2D8B7A", to: "#1E6B5C", text: BRAND.white, textSub: "rgba(255,255,255,0.8)" },
    large: { from: "#E8567F", to: "#C93D63", text: BRAND.white, textSub: "rgba(255,255,255,0.8)" },
  };
  const sizeAccent = sizeColourMap[resolvedDog.size]?.to || BRAND.blueDark;
  const headerTextColour = sizeColourMap[resolvedDog.size]?.text || BRAND.white;
  const headerSubTextColour = sizeColourMap[resolvedDog.size]?.textSub || "rgba(255,255,255,0.8)";

  const sectionLabel = {
    fontWeight: 800,
    fontSize: 12,
    color: sizeAccent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  const detailRow = (label, value) => (
    <div
      style={{
        padding: "8px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <span style={sectionLabel}>{label}</span>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: BRAND.text,
          marginTop: 4,
        }}
      >
        {value || "—"}
      </div>
    </div>
  );

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${BRAND.greyLight}`,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: BRAND.text,
  };

  const headerColour = sizeColourMap[resolvedDog.size] || { from: BRAND.blue, to: BRAND.blueDark };

  const displayAlerts = isEditing ? editAlerts : resolvedDog.alerts || [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BRAND.white,
          borderRadius: 16,
          width: 360,
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${headerColour.from}, ${headerColour.to})`,
            padding: "20px 24px",
            borderRadius: "16px 16px 0 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, marginRight: 12 }}>
            {isEditing ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Dog name"
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: headerTextColour,
                    background: "rgba(255,255,255,0.15)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 8,
                    padding: "4px 10px",
                    width: "100%",
                    boxSizing: "border-box",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    value={editBreed}
                    onChange={(e) => setEditBreed(e.target.value)}
                    placeholder="Breed"
                    style={{
                      fontSize: 13,
                      color: headerTextColour,
                      background: "rgba(255,255,255,0.15)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      flex: 1,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <span style={{ fontSize: 12, color: headerSubTextColour }}>Born</span>
                  <select
                    value={editDobMonth}
                    onChange={(e) => setEditDobMonth(e.target.value)}
                    style={{
                      fontSize: 12,
                      color: headerTextColour,
                      background: "rgba(255,255,255,0.15)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: 6,
                      padding: "3px 4px",
                      outline: "none",
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <option value="" style={{ color: BRAND.text }}>Month</option>
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                      <option key={m} value={String(i + 1).padStart(2, "0")} style={{ color: BRAND.text }}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={editDobYear}
                    onChange={(e) => setEditDobYear(e.target.value)}
                    style={{
                      fontSize: 12,
                      color: headerTextColour,
                      background: "rgba(255,255,255,0.15)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: 6,
                      padding: "3px 4px",
                      outline: "none",
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <option value="" style={{ color: BRAND.text }}>Year</option>
                    {Array.from({ length: 26 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={String(y)} style={{ color: BRAND.text }}>{y}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, color: headerTextColour }}>
                  {titleCase(resolvedDog.name)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: headerSubTextColour,
                    marginTop: 4,
                  }}
                >
                  {titleCase(resolvedDog.breed)}{displayAge ? ` · ${displayAge}` : ""}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 8,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 14,
              color: headerTextColour,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {"×"}
          </button>
        </div>

        <div style={{ padding: "16px 24px 0" }}>
          {isEditing ? (
            <div style={{ padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
              <div style={{ ...sectionLabel, marginBottom: 6 }}>Owner</div>
              <div
                onClick={() => setShowOwnerSearch(!showOwnerSearch)}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: showOwnerSearch ? BRAND.blueLight : BRAND.white,
                }}
              >
                <span style={{ fontWeight: 600 }}>{editOwnerLabel || "Select owner..."}</span>
                <span style={{ fontSize: 11, color: BRAND.textLight }}>
                  {showOwnerSearch ? "▲" : "▼"}
                </span>
              </div>
              {showOwnerSearch && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
                      <IconSearch size={14} colour={BRAND.textLight} />
                    </div>
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={ownerSearchQuery}
                      onChange={(e) => setOwnerSearchQuery(e.target.value)}
                      autoFocus
                      style={{
                        ...inputStyle,
                        paddingLeft: 32,
                        borderColor: BRAND.blue,
                      }}
                    />
                  </div>
                  {ownerSearchResults.length > 0 && (
                    <div style={{ marginTop: 4, border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, overflow: "hidden" }}>
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
                            style={{
                              padding: "8px 12px",
                              cursor: "pointer",
                              borderBottom: `1px solid ${BRAND.greyLight}`,
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.blueLight)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.white)}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{fullName}</div>
                            {candidate.phone && (
                              <div style={{ fontSize: 12, color: BRAND.textLight }}>{candidate.phone}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {ownerSearchQuery.trim() && ownerSearchResults.length === 0 && (
                    <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 6, textAlign: "center" }}>
                      No matching humans found
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
              <div style={sectionLabel}>Owner</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <div
                  onClick={() => {
                    if (ownerOpenValue) {
                      onClose();
                      onOpenHuman && onOpenHuman(ownerOpenValue);
                    }
                  }}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: BRAND.teal,
                    cursor: ownerOpenValue ? "pointer" : "default",
                  }}
                >
                  {titleCase(ownerLabel) || "—"}
                </div>
                {owner?.phone && (
                  <a
                    href={waLink(owner.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: BRAND.textLight, textDecoration: "none" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = BRAND.teal; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = BRAND.textLight; }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {owner.phone}
                  </a>
                )}
              </div>
            </div>
          )}

          {isEditing ? (
            <div
              style={{
                padding: "8px 0",
                borderBottom: `1px solid ${BRAND.greyLight}`,
              }}
            >
              <div style={{ ...sectionLabel, marginBottom: 6 }}>
                Groom Notes
              </div>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
              />
            </div>
          ) : (
            detailRow("Groom Notes", resolvedDog.groomNotes)
          )}

          {isEditing ? (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  ...sectionLabel,
                  marginBottom: 10,
                  textAlign: "center",
                }}
              >
                Alerts
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "center",
                }}
              >
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
                      style={{
                        background: active ? opt.color : BRAND.white,
                        color: active ? BRAND.white : opt.color,
                        border: `2px solid ${opt.color}`,
                        padding: "6px 12px",
                        borderRadius: 16,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setHasAllergy(!hasAllergy)}
                  style={{
                    background: hasAllergy ? BRAND.coral : BRAND.white,
                    color: hasAllergy ? BRAND.white : BRAND.coral,
                    border: `2px solid ${BRAND.coral}`,
                    padding: "6px 12px",
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  Allergy
                </button>
              </div>
              {hasAllergy && (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Allergic to..."
                    value={allergyInput}
                    onChange={(e) => setAllergyInput(e.target.value)}
                    style={{
                      ...inputStyle,
                      textAlign: "center",
                      borderColor: BRAND.coral,
                      borderWidth: 2,
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            displayAlerts.length > 0 && (
              <>
                <div
                  style={{
                    ...sectionLabel,
                    marginTop: 16,
                    marginBottom: 8,
                  }}
                >
                  Alerts
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {displayAlerts.map((alert) => (
                    <span
                      key={alert}
                      style={{
                        background: BRAND.coralLight,
                        color: BRAND.coral,
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
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
        <div style={{ padding: "0 24px", marginTop: 12 }}>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>
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
                  style={{
                    padding: "8px 0",
                    borderBottom: `1px solid ${BRAND.greyLight}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    onClick={() => {
                      onClose();
                      onOpenHuman && onOpenHuman(trustedHuman?.id || trustedId);
                    }}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: BRAND.teal,
                      cursor: "pointer",
                    }}
                  >
                    {titleCase(trustedLabel)}
                  </span>
                  {isEditing && onUpdateHuman && (
                    <button
                      onClick={() => handleRemoveTrusted(trustedId)}
                      style={{
                        background: "none",
                        border: "none",
                        color: BRAND.coral,
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: "0 4px",
                        lineHeight: 1,
                        fontFamily: "inherit",
                      }}
                      title="Remove trusted human"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 13, color: BRAND.textLight, fontStyle: "italic" }}>
              None listed
            </div>
          )}

          {isEditing && onUpdateHuman && (
            <>
              <button
                onClick={() => setShowTrustedSearch(!showTrustedSearch)}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "8px",
                  borderRadius: 10,
                  border: `1.5px dashed ${BRAND.teal}`,
                  background: showTrustedSearch ? BRAND.teal : BRAND.tealLight,
                  color: showTrustedSearch ? BRAND.white : BRAND.teal,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                {showTrustedSearch ? "Cancel" : "+ Add a trusted human"}
              </button>

              {showTrustedSearch && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
                      <IconSearch size={14} colour={BRAND.textLight} />
                    </div>
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={trustedSearchQuery}
                      onChange={(e) => setTrustedSearchQuery(e.target.value)}
                      autoFocus
                      style={{
                        ...inputStyle,
                        paddingLeft: 32,
                        borderColor: BRAND.teal,
                      }}
                    />
                  </div>
                  {trustedSearchResults.length > 0 && (
                    <div style={{ marginTop: 4, border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, overflow: "hidden" }}>
                      {trustedSearchResults.map((candidate) => {
                        const fullName = candidate.fullName || `${candidate.name || ""} ${candidate.surname || ""}`.trim();
                        return (
                          <div
                            key={candidate.id}
                            onClick={() => handleAddTrusted(candidate.id)}
                            style={{
                              padding: "8px 12px",
                              cursor: "pointer",
                              borderBottom: `1px solid ${BRAND.greyLight}`,
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.tealLight)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.white)}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{fullName}</div>
                            {candidate.phone && (
                              <div style={{ fontSize: 12, color: BRAND.textLight }}>{candidate.phone}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {trustedSearchQuery.trim() && trustedSearchResults.length === 0 && !showNewTrustedForm && (
                    <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 6, textAlign: "center" }}>
                      No matching humans found
                    </div>
                  )}
                  {onAddHuman && !showNewTrustedForm && (
                    <button
                      onClick={() => setShowNewTrustedForm(true)}
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: "8px",
                        borderRadius: 8,
                        border: `1.5px solid ${BRAND.teal}`,
                        background: BRAND.white,
                        color: BRAND.teal,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                    >
                      + Add new human
                    </button>
                  )}
                  {showNewTrustedForm && (
                    <div style={{ marginTop: 8, padding: 12, background: BRAND.offWhite, borderRadius: 8, border: `1px solid ${BRAND.greyLight}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>New human</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input
                          type="text"
                          placeholder="First name"
                          value={newTrustedName}
                          onChange={(e) => setNewTrustedName(e.target.value)}
                          autoFocus
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <input
                          type="text"
                          placeholder="Surname"
                          value={newTrustedSurname}
                          onChange={(e) => setNewTrustedSurname(e.target.value)}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                      <input
                        type="tel"
                        placeholder="Phone number"
                        value={newTrustedPhone}
                        onChange={(e) => setNewTrustedPhone(e.target.value)}
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 8 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={handleAddNewTrusted}
                          disabled={!newTrustedName.trim() || !newTrustedSurname.trim() || !newTrustedPhone.trim()}
                          style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: 8,
                            border: "none",
                            background: (!newTrustedName.trim() || !newTrustedSurname.trim() || !newTrustedPhone.trim()) ? BRAND.greyLight : BRAND.teal,
                            color: (!newTrustedName.trim() || !newTrustedSurname.trim() || !newTrustedPhone.trim()) ? BRAND.textLight : BRAND.white,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: (!newTrustedName.trim() || !newTrustedSurname.trim() || !newTrustedPhone.trim()) ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                          }}
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
                          style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: 8,
                            border: `1px solid ${BRAND.greyLight}`,
                            background: BRAND.white,
                            color: BRAND.text,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
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

        <div
          style={{
            padding: "16px 24px 20px",
            display: "flex",
            gap: 10,
            background: BRAND.offWhite,
            borderTop: `1px solid ${BRAND.greyLight}`,
            marginTop: 16,
          }}
        >
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: headerColour.from,
                  color: BRAND.white,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = headerColour.to)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = headerColour.from)
                }
              >
                <IconTick size={16} colour={BRAND.white} /> Save
              </button>
              <button
                onClick={handleCancel}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: `1.5px solid ${BRAND.greyLight}`,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: BRAND.white,
                  color: BRAND.textLight,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = BRAND.offWhite)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = BRAND.white)
                }
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 10,
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: headerColour.from,
                color: BRAND.white,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = headerColour.to)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = headerColour.from)
              }
            >
              <IconEdit size={16} colour={BRAND.white} /> Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
