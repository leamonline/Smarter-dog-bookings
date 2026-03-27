import { useState, useMemo } from "react";
import { BRAND, SERVICES } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";

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
      <div
        style={{
          marginTop: 20,
          fontWeight: 800,
          fontSize: 12,
          color: BRAND.blueDark,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
        }}
      >
        Recent Bookings
      </div>
      {history.slice(0, 5).map((booking, i) => {
        const service = SERVICES.find((s) => s.id === booking.service);
        return (
          <div
            key={`${booking.id || booking.date}-${i}`}
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
                {booking.date}
              </span>
              <span style={{ color: BRAND.textLight, marginLeft: 6 }}>
                {booking.dogName}
              </span>
              <span style={{ color: BRAND.textLight, marginLeft: 4 }}>
                {service?.icon} {service?.name}
              </span>
            </div>
            <span
              style={{
                fontWeight: 600,
                color:
                  booking.status === "Completed"
                    ? BRAND.openGreen
                    : BRAND.textLight,
                fontSize: 11,
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
  bookingsByDate,
}) {
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

  const [showTrustedSearch, setShowTrustedSearch] = useState(false);
  const [trustedSearchQuery, setTrustedSearchQuery] = useState("");

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

  const handleAddTrusted = (selectedHumanId) => {
    const currentTrusted = human.trustedIds || [];
    onUpdateHuman(human.id || humanId, {
      trustedIds: [...currentTrusted, selectedHumanId],
    });

    const selectedHuman = getHumanByIdOrName(humans, selectedHumanId);
    if (selectedHuman) {
      const theirTrusted = selectedHuman.trustedIds || [];
      if (!theirTrusted.includes(human.id || humanId)) {
        onUpdateHuman(selectedHuman.id || selectedHumanId, {
          trustedIds: [...theirTrusted, human.id || humanId],
        });
      }
    }

    setTrustedSearchQuery("");
    setShowTrustedSearch(false);
  };

  const detailRow = (label, value) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <span style={{ fontSize: 13, color: BRAND.textLight }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: BRAND.text,
          textAlign: "right",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );

  const contactRow = (label, active) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <span style={{ fontSize: 13, color: BRAND.textLight }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: active ? BRAND.teal : BRAND.coral,
        }}
      >
        {active ? "✅ Active" : "❌ Off"}
      </span>
    </div>
  );

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
          width: 380,
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${BRAND.teal}, #236b5d)`,
            padding: "20px 24px",
            borderRadius: "16px 16px 0 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.white }}>
              {humanFullName}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.8)",
                marginTop: 4,
              }}
            >
              {human.phone}
            </div>
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
              color: BRAND.white,
              fontWeight: 700,
            }}
          >
            {"×"}
          </button>
        </div>

        <div style={{ padding: "16px 24px 20px" }}>
          {detailRow("Address", human.address)}
          {detailRow("Email", human.email)}
          {contactRow("SMS", human.sms)}
          {contactRow("WhatsApp", human.whatsapp)}
          {detailRow("Facebook", human.fb)}
          {detailRow("Instagram", human.insta)}
          {detailRow("TikTok", human.tiktok)}
          {detailRow("Notes", human.notes)}

          {human.historyFlag && (
            <div
              style={{
                fontSize: 13,
                color: BRAND.coral,
                marginTop: 12,
                fontWeight: 700,
                background: BRAND.coralLight,
                padding: "8px 12px",
                borderRadius: 8,
              }}
            >
              {"⚠️"} {human.historyFlag}
            </div>
          )}

          <div
            style={{
              marginTop: 20,
              fontWeight: 800,
              fontSize: 12,
              color: BRAND.blueDark,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            Dogs
          </div>
          {humanDogs.length > 0 ? (
            humanDogs.map((dog) => (
              <div
                key={dog.id}
                onClick={() => {
                  onClose();
                  onOpenDog && onOpenDog(dog.id || dog.name);
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${BRAND.greyLight}`,
                  cursor: "pointer",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: BRAND.text,
                    }}
                  >
                    {dog.name}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.textLight }}>
                    {dog.breed} {"·"} {dog.age}
                  </div>
                </div>
                {dog.alerts && dog.alerts.length > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      color: BRAND.coral,
                      fontWeight: 600,
                    }}
                  >
                    {"⚠️"} {dog.alerts.length} alert
                    {dog.alerts.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div
              style={{
                fontSize: 13,
                color: BRAND.textLight,
                fontStyle: "italic",
              }}
            >
              No dogs linked
            </div>
          )}

          <div
            style={{
              marginTop: 20,
              fontWeight: 800,
              fontSize: 12,
              color: BRAND.blueDark,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
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
                  style={{
                    padding: "8px 0",
                    borderBottom: `1px solid ${BRAND.greyLight}`,
                    fontSize: 13,
                    fontWeight: 600,
                    color: BRAND.teal,
                    cursor: "pointer",
                  }}
                >
                  {trustedLabel}
                </div>
              );
            })
          ) : (
            <div
              style={{
                fontSize: 13,
                color: BRAND.textLight,
                fontStyle: "italic",
              }}
            >
              None listed
            </div>
          )}

          <button
            onClick={() => setShowTrustedSearch(!showTrustedSearch)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "10px",
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
            {showTrustedSearch ? "Cancel" : "+ Add a trusted Human"}
          </button>

          <HumanBookingHistory
            human={human}
            dogs={dogs}
            bookingsByDate={bookingsByDate}
          />

          {showTrustedSearch && (
            <div style={{ marginTop: 10 }}>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                  }}
                >
                  <IconSearch size={14} colour={BRAND.textLight} />
                </div>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={trustedSearchQuery}
                  onChange={(e) => setTrustedSearchQuery(e.target.value)}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "8px 10px 8px 32px",
                    borderRadius: 8,
                    border: `1.5px solid ${BRAND.teal}`,
                    fontSize: 13,
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    outline: "none",
                    color: BRAND.text,
                  }}
                />
              </div>

              {trustedSearchResults.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    border: `1px solid ${BRAND.greyLight}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {trustedSearchResults.map((candidate) => {
                    const fullName =
                      candidate.fullName ||
                      `${candidate.name || ""} ${candidate.surname || ""}`.trim();

                    return (
                      <div
                        key={candidate.id}
                        onClick={() => handleAddTrusted(candidate.id)}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: `1px solid ${BRAND.greyLight}`,
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = BRAND.tealLight;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = BRAND.white;
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: BRAND.text,
                          }}
                        >
                          {fullName}
                        </div>
                        <div style={{ fontSize: 12, color: BRAND.textLight }}>
                          {candidate.phone}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {trustedSearchQuery.trim() &&
                trustedSearchResults.length === 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: BRAND.textLight,
                      marginTop: 8,
                      textAlign: "center",
                    }}
                  >
                    No matching humans found
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
