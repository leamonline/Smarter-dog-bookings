import { useState, useMemo } from "react";
import { BRAND } from "../../constants/index.js";
import { getHumanByIdOrName } from "../../engine/bookingRules.js";
import { IconSearch } from "../icons/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";

export function DogsView({ dogs, humans, onOpenDog, onAddDog }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredDogs = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const allDogs = Object.values(dogs).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!query) return allDogs;

    return allDogs.filter((dog) => {
      const owner = getHumanByIdOrName(humans, dog._humanId || dog.humanId);
      const ownerName =
        owner?.fullName ||
        (owner ? `${owner.name} ${owner.surname}`.trim() : dog.humanId || "");
      const alertStr = (dog.alerts || []).join(" ");
      const searchString =
        `${dog.name} ${dog.breed} ${dog.age || ""} ${ownerName} ${alertStr} ${dog.groomNotes || ""}`.toLowerCase();
      return searchString.includes(query);
    });
  }, [searchQuery, dogs, humans]);

  return (
    <div style={{ animation: "fadeIn 0.2s ease-in" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 800,
              margin: 0,
              color: BRAND.text,
            }}
          >
            Dogs Directory
          </h2>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>
            Search by name, breed, owner, or alerts.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            width: "100%",
            maxWidth: 460,
          }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <div
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
              }}
            >
              <IconSearch size={16} colour={BRAND.textLight} />
            </div>
            <input
              type="text"
              placeholder="Search dogs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 38px",
                borderRadius: 10,
                border: `1.5px solid ${BRAND.greyLight}`,
                fontSize: 14,
                fontFamily: "inherit",
                boxSizing: "border-box",
                outline: "none",
                color: BRAND.text,
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = BRAND.blue;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = BRAND.greyLight;
              }}
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: BRAND.blue,
              color: BRAND.white,
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = BRAND.blueDark;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = BRAND.blue;
            }}
          >
            + Add Dog
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {filteredDogs.map((dog) => {
          const owner = getHumanByIdOrName(humans, dog._humanId || dog.humanId);
          const ownerName =
            owner?.fullName ||
            (owner
              ? `${owner.name} ${owner.surname}`.trim()
              : dog.humanId || "");
          const alertCount = (dog.alerts || []).length;

          return (
            <div
              key={dog.id}
              onClick={() => onOpenDog(dog.id || dog.name)}
              style={{
                background: BRAND.white,
                borderRadius: 12,
                border: `1px solid ${BRAND.greyLight}`,
                overflow: "hidden",
                cursor: "pointer",
                transition: "all 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = BRAND.blue;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 16px rgba(0,184,224,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = BRAND.greyLight;
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)";
              }}
            >
              <div
                style={{
                  background: BRAND.blueLight,
                  padding: "14px 16px",
                  borderBottom: `1px solid ${BRAND.greyLight}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: BRAND.blueDark,
                    }}
                  >
                    {dog.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: BRAND.text,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {dog.breed} {"·"} {dog.age}
                  </div>
                </div>
                {alertCount > 0 && (
                  <span
                    style={{
                      background: BRAND.coralLight,
                      color: BRAND.coral,
                      padding: "4px 10px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {"⚠️"} {alertCount} alert{alertCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div style={{ padding: "14px 16px" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: BRAND.textLight,
                    marginBottom: 6,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Owner
                </div>
                <span
                  style={{
                    background: BRAND.offWhite,
                    border: `1px solid ${BRAND.greyLight}`,
                    padding: "4px 10px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    color: BRAND.text,
                  }}
                >
                  {ownerName}
                </span>

                {dog.groomNotes && (
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: BRAND.textLight,
                        marginBottom: 4,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Groom Notes
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: BRAND.text,
                        lineHeight: 1.4,
                      }}
                    >
                      {dog.groomNotes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredDogs.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "60px 20px",
              color: BRAND.textLight,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"🐾"}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              No dogs found matching "{searchQuery}"
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Try searching by breed or owner name instead.
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddDogModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddDog}
          humans={humans}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
