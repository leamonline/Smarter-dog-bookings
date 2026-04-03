import { useState } from "react";
import { BRAND } from "../../constants/index.js";
import { useWaitlist } from "../../supabase/hooks/useWaitlist.js";

export function WaitlistPanel({ currentDateObj, humans, dogs, onOpenHuman }) {
  const { waitlist, loading, error, joinWaitlist, leaveWaitlist } = useWaitlist(currentDateObj);
  const [showAdd, setShowAdd] = useState(false);
  const [addingId, setAddingId] = useState(null);
  
  // Sorted humans for dropdown
  const humanList = Object.values(humans || {}).sort((a, b) => a.name.localeCompare(b.name));

  const handleJoin = async (humanId) => {
    if (!humanId) return;
    setAddingId(humanId);
    try {
      await joinWaitlist(humanId, currentDateObj.toISOString().split("T")[0]);
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert("Failed to join waitlist");
    } finally {
      setAddingId(null);
    }
  };

  if (loading && waitlist.length === 0) return null;

  return (
    <div style={{
      borderTop: `1px solid ${BRAND.greyLight}`,
      background: "#FFFBF2",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Waitlist ({waitlist.length})
        </div>
        {!showAdd && (
          <button 
            type="button" 
            onClick={() => setShowAdd(true)}
            style={{
              padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${BRAND.greyLight}`, background: BRAND.white,
              color: BRAND.textLight, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = BRAND.blue; e.currentTarget.style.borderColor = BRAND.blue; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = BRAND.textLight; e.currentTarget.style.borderColor = BRAND.greyLight; }}
          >
            + Add Person
          </button>
        )}
      </div>

      {showAdd && (
        <div style={{ display: "flex", gap: 8, background: BRAND.white, padding: "8px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}` }}>
          <select 
            onChange={(e) => handleJoin(e.target.value)}
            disabled={addingId !== null}
            defaultValue=""
            style={{
              flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${BRAND.greyLight}`, fontSize: 12
            }}
          >
            <option value="" disabled>Select a customer...</option>
            {humanList.map(h => (
              <option key={h.id} value={h.id}>{h.name} {h.surname} - {h.phone}</option>
            ))}
          </select>
          <button 
            onClick={() => setShowAdd(false)}
            style={{
              padding: "6px 10px", borderRadius: 6, border: "none", background: BRAND.coralLight, color: BRAND.coral, fontSize: 11, fontWeight: 700, cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: BRAND.coral }}>{error}</div>}

      {waitlist.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {waitlist.map(entry => {
            const h = entry.humans;
            const theirDogs = Object.values(dogs || {}).filter(d => d.humanId === h.id);
            const dogNames = theirDogs.map(d => d.name).join(", ") || "No dogs";

            return (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: BRAND.white, padding: "8px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`
              }}>
                <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => onOpenHuman && onOpenHuman(h.id)}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>{h.name} {h.surname}</div>
                  <div style={{ fontSize: 11, color: BRAND.textLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {h.phone} · {dogNames}
                  </div>
                </div>
                <button 
                  onClick={() => leaveWaitlist(entry.id)}
                  style={{
                    background: "none", border: "none", color: BRAND.coral, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 8px"
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, fontStyle: "italic", color: BRAND.textLight }}>No one is waiting for this date.</div>
      )}
    </div>
  );
}
