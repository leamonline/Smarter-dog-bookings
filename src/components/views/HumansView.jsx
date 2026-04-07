import { useState, useMemo } from "react";
import { BRAND } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";
import { AddHumanModal } from "../modals/AddHumanModal.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

const SIZE_PILL = {
  small:  { bg: "#FFF8E0", text: "#D4A500", border: "#F5C518" },
  medium: { bg: BRAND.tealLight, text: "#1E6B5C", border: BRAND.teal },
  large:  { bg: BRAND.coralLight, text: "#C93D63", border: BRAND.coral },
};
const DEFAULT_PILL = { bg: BRAND.offWhite, text: BRAND.text, border: BRAND.greyLight };

export function HumansView({ humans, dogs, onOpenHuman, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const sortedHumans = useMemo(() => Object.values(humans).sort((a, b) => a.name.localeCompare(b.name)), [humans]);

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
            Humans Directory
          </h2>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>
            Search by name, phone, address, dog, or notes.
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
              placeholder="Search rolodex..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
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
                e.target.style.borderColor = BRAND.teal;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = BRAND.greyLight;
              }}
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: BRAND.teal,
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
              e.currentTarget.style.background = "#236b5d";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = BRAND.teal;
            }}
          >
            + Add Human
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
        {sortedHumans.map((human) => {
          const fullName = human.fullName || `${human.name} ${human.surname}`;
          const humanDogs = Object.values(dogs).filter(
            (dog) => dog._humanId === human.id || dog.humanId === fullName,
          );

          return (
            <div
              key={human.id}
              onClick={() => onOpenHuman(human.id || fullName)}
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
                e.currentTarget.style.borderColor = BRAND.teal;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 16px rgba(45,139,122,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = BRAND.greyLight;
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)";
              }}
            >
              <div
                style={{
                  background: BRAND.tealLight,
                  padding: "14px 16px",
                  borderBottom: `1px solid ${BRAND.greyLight}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 16, fontWeight: 800, color: "#1F6659" }}
                  >
                    {titleCase(fullName)}
                  </div>
                  {human.phone ? (
                    <a
                      href={`tel:${human.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 13,
                        color: BRAND.text,
                        fontWeight: 600,
                        marginTop: 4,
                        display: "block",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = BRAND.teal; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = BRAND.text; }}
                    >
                      {human.phone}
                    </a>
                  ) : (
                    <div style={{ fontSize: 13, color: BRAND.textLight, fontWeight: 600, marginTop: 4, fontStyle: "italic" }}>
                      No phone
                    </div>
                  )}
                </div>
                {human.historyFlag && (
                  <span title={human.historyFlag} style={{ fontSize: 16 }}>
                    {"⚠️"}
                  </span>
                )}
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#1E6B5C",
                    marginBottom: 8,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Dogs
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {humanDogs.length > 0 ? (
                    humanDogs.map((dog) => {
                      const pill = SIZE_PILL[dog.size] || DEFAULT_PILL;
                      return (
                        <span
                          key={dog.id}
                          style={{
                            background: pill.bg,
                            border: `1px solid ${pill.border}`,
                            padding: "4px 10px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            color: pill.text,
                          }}
                        >
                          {titleCase(dog.name)}{" "}
                          <span style={{ fontWeight: 500, opacity: 0.75 }}>
                            ({titleCase(dog.breed)})
                          </span>
                        </span>
                      );
                    })
                  ) : (
                    <span
                      style={{
                        fontSize: 13,
                        color: BRAND.textLight,
                        fontStyle: "italic",
                      }}
                    >
                      None listed
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {sortedHumans.length === 0 && !isSearching && (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "60px 20px",
              color: BRAND.textLight,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"🔍"}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {searchQuery ? `No humans found matching "${searchQuery}"` : "No humans yet."}
            </div>
            {searchQuery && (
              <div style={{ fontSize: 13, marginTop: 6 }}>
                Try searching by phone number or dog breed instead.
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 13, color: BRAND.textLight }}>
          {isSearching ? (
            <span style={{ fontStyle: "italic" }}>Searching...</span>
          ) : (
            <span>Showing {sortedHumans.length} of {totalCount} humans</span>
          )}
        </div>
        {hasMore && !isSearching && (
          <button
            onClick={loadMore}
            style={{
              border: `1px solid ${BRAND.greyLight}`,
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              background: BRAND.white,
              color: BRAND.text,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = BRAND.teal;
              e.currentTarget.style.color = BRAND.teal;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BRAND.greyLight;
              e.currentTarget.style.color = BRAND.text;
            }}
          >
            Load more
          </button>
        )}
      </div>

      {showAddModal && (
        <AddHumanModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddHuman}
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
