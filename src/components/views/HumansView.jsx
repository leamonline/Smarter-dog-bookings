import { useState, useMemo } from "react";
import { BRAND } from "../../constants/index.js";
import { SAMPLE_HUMANS, SAMPLE_DOGS } from "../../data/sample.js";
import { IconSearch } from "../icons/index.jsx";

export function HumansView({ onOpenHuman }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredHumans = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const allHumans = Object.values(SAMPLE_HUMANS).sort((a, b) => a.name.localeCompare(b.name));
    if (!query) return allHumans;

    return allHumans.filter(human => {
      const fullName = `${human.name} ${human.surname}`.toLowerCase();
      const dogs = Object.values(SAMPLE_DOGS).filter(d => d.humanId === `${human.name} ${human.surname}`);
      const dogSearchString = dogs.map(d => `${d.name} ${d.breed}`).join(" ").toLowerCase();
      const searchString = `${fullName} ${human.phone} ${human.email} ${human.address} ${human.notes} ${human.historyFlag} ${human.trustedIds.join(" ")} ${dogSearchString}`;

      return searchString.includes(query);
    });
  }, [searchQuery]);

  return (
    <div style={{ animation: "fadeIn 0.2s ease-in" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: BRAND.text }}>Humans Directory</h2>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Search by name, phone, address, dog, or notes.</div>
        </div>

        <div style={{ position: "relative", width: "100%", maxWidth: 320 }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
            <IconSearch size={16} colour={BRAND.textLight} />
          </div>
          <input
            type="text"
            placeholder="Search rolodex..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10,
              border: `1.5px solid ${BRAND.greyLight}`, fontSize: 14, fontFamily: "inherit",
              boxSizing: "border-box", outline: "none", color: BRAND.text,
              transition: "border-color 0.15s"
            }}
            onFocus={e => e.target.style.borderColor = BRAND.teal}
            onBlur={e => e.target.style.borderColor = BRAND.greyLight}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {filteredHumans.map(human => {
          const fullName = `${human.name} ${human.surname}`;
          const dogs = Object.values(SAMPLE_DOGS).filter(d => d.humanId === fullName);

          return (
            <div
              key={human.id}
              onClick={() => onOpenHuman(fullName)}
              style={{
                background: BRAND.white, borderRadius: 12, border: `1px solid ${BRAND.greyLight}`,
                overflow: "hidden", cursor: "pointer", transition: "all 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND.teal; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(45,139,122,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)"; }}
            >
              <div style={{ background: BRAND.tealLight, padding: "14px 16px", borderBottom: `1px solid ${BRAND.greyLight}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1F6659" }}>{fullName}</div>
                  <div style={{ fontSize: 13, color: BRAND.text, fontWeight: 600, marginTop: 4 }}>{human.phone || "No phone"}</div>
                </div>
                {human.historyFlag && (
                  <span title={human.historyFlag} style={{ fontSize: 16 }}>{"\u26A0\uFE0F"}</span>
                )}
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: BRAND.textLight, marginBottom: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Dogs</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {dogs.length > 0 ? dogs.map(d => (
                    <span key={d.id} style={{ background: BRAND.offWhite, border: `1px solid ${BRAND.greyLight}`, padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, color: BRAND.text }}>
                      {d.name} <span style={{ color: BRAND.textLight, fontWeight: 500 }}>({d.breed})</span>
                    </span>
                  )) : <span style={{ fontSize: 13, color: BRAND.textLight, fontStyle: "italic" }}>None listed</span>}
                </div>
              </div>
            </div>
          );
        })}

        {filteredHumans.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: BRAND.textLight }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"\uD83D\uDD0D"}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No humans found matching "{searchQuery}"</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Try searching by phone number or dog breed instead.</div>
          </div>
        )}
      </div>
    </div>
  );
}
