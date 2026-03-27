import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../supabase/client.js";
import { BRAND } from "../../constants/index.js";
import { toDateStr } from "../../supabase/transforms.js";

const SERVICE_LABELS = {
  "full-groom": "Full Groom",
  "bath-and-brush": "Bath & Brush",
  "bath-and-deshed": "Bath & Deshed",
  "puppy-groom": "Puppy Groom",
  "nail-trim": "Nail Trim",
};

const STATUS_COLOURS = {
  "Not Arrived": { bg: "#FEF3C7", text: "#92400E" },
  "Checked In": { bg: "#D1FAE5", text: "#065F46" },
  "In the Bath": { bg: "#DBEAFE", text: "#1E40AF" },
  "Drying": { bg: "#E0E7FF", text: "#3730A3" },
  "On the Table": { bg: "#EDE9FE", text: "#5B21B6" },
  "Finished": { bg: "#D1FAE5", text: "#065F46" },
  "Completed": { bg: "#F3F4F6", text: "#374151" },
};
const SERVICE_ICONS = {
  "full-groom": "\u2702\uFE0F",
  "bath-and-brush": "\uD83D\uDEC1",
  "bath-and-deshed": "\uD83E\uDDF9",
  "puppy-groom": "\uD83D\uDC3E",
  "nail-trim": "\u2702\uFE0F",
};

function formatSlot(slot) {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function CustomerDashboard({ humanRecord, onSignOut }) {
  const [activeTab, setActiveTab] = useState("bookings");
  const [dogs, setDogs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDetails, setEditingDetails] = useState(false);
  const [details, setDetails] = useState({
    phone: humanRecord?.phone || "",
    email: humanRecord?.email || "",
    address: humanRecord?.address || "",
  });
  const humanName = `${humanRecord?.name || ""} ${humanRecord?.surname || ""}`.trim();

  // Fetch dogs and bookings for this human
  useEffect(() => {
    if (!supabase || !humanRecord?.id) { setLoading(false); return; }

    async function fetchData() {
      // Get dogs owned by this human
      const { data: dogRows } = await supabase
        .from("dogs")
        .select("*")
        .eq("human_id", humanRecord.id)
        .order("name");
      setDogs(dogRows || []);

      // Get bookings for those dogs (upcoming + recent)
      const dogIds = (dogRows || []).map(d => d.id);
      if (dogIds.length > 0) {
        const today = toDateStr(new Date());
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 30);
        const pastStr = toDateStr(pastDate);

        const { data: bookingRows } = await supabase
          .from("bookings")
          .select("*, dogs(name, breed, size)")
          .in("dog_id", dogIds)
          .gte("booking_date", pastStr)
          .order("booking_date", { ascending: true })
          .order("slot", { ascending: true });
        setBookings(bookingRows || []);
      }
      setLoading(false);
    }
    fetchData();
  }, [humanRecord]);
  // Split bookings into upcoming vs past
  const today = toDateStr(new Date());
  const upcoming = useMemo(() => bookings.filter(b => b.booking_date >= today), [bookings, today]);
  const past = useMemo(() => bookings.filter(b => b.booking_date < today).reverse(), [bookings, today]);

  // Save contact details
  const handleSaveDetails = useCallback(async () => {
    if (!supabase || !humanRecord?.id) return;
    const { error: err } = await supabase
      .from("humans")
      .update({ phone: details.phone, email: details.email, address: details.address })
      .eq("id", humanRecord.id);
    if (!err) setEditingDetails(false);
  }, [humanRecord, details]);

  // Cancel a booking
  const handleCancelBooking = useCallback(async (bookingId) => {
    if (!supabase) return;
    if (!window.confirm("Are you sure you want to cancel this appointment?")) return;
    const { error: err } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (!err) {
      setBookings(prev => prev.filter(b => b.id !== bookingId));
    }
  }, []);
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8FFFE", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
        <div style={{ textAlign: "center", color: BRAND.textLight }}>Loading your dashboard...</div>
      </div>
    );
  }

  const tabStyle = (active) => ({
    padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
    background: active ? BRAND.teal : "transparent",
    color: active ? BRAND.white : BRAND.textLight,
  });

  const cardStyle = {
    background: BRAND.white, borderRadius: 12, padding: 16,
    border: `1px solid ${BRAND.greyLight}`, marginBottom: 12,
  };
  return (
    <div style={{ minHeight: "100vh", background: "#F8FFFE", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ background: BRAND.white, borderBottom: `1px solid ${BRAND.greyLight}`, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.teal }}>Dog</span>
          </div>
          <div style={{ fontSize: 12, color: BRAND.textLight }}>Hi, {humanName}</div>
        </div>
        <button onClick={onSignOut} style={{
          background: BRAND.coralLight, border: "none", borderRadius: 8,
          padding: "8px 14px", fontSize: 13, fontWeight: 700, color: BRAND.coral,
          cursor: "pointer", fontFamily: "inherit",
        }}>Log out</button>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: BRAND.white, borderRadius: 10, padding: 4, border: `1px solid ${BRAND.greyLight}` }}>
          <button onClick={() => setActiveTab("bookings")} style={tabStyle(activeTab === "bookings")}>Bookings</button>
          <button onClick={() => setActiveTab("dogs")} style={tabStyle(activeTab === "dogs")}>My Dogs</button>
          <button onClick={() => setActiveTab("details")} style={tabStyle(activeTab === "details")}>My Details</button>
        </div>
        {/* BOOKINGS TAB */}
        {activeTab === "bookings" && (
          <div>
            {upcoming.length === 0 && past.length === 0 ? (
              <div style={cardStyle}>
                <div style={{ textAlign: "center", padding: 20, color: BRAND.textLight }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🐾</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>No bookings yet</div>
                  <div style={{ fontSize: 13 }}>Give the salon a call to book your first appointment!</div>
                </div>
              </div>
            ) : (
              <>
                {upcoming.length > 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.teal, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Upcoming</div>
                    {upcoming.map(b => {
                      const sc = STATUS_COLOURS[b.status] || STATUS_COLOURS["Not Arrived"];
                      return (
                        <div key={b.id} style={cardStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>
                                {SERVICE_ICONS[b.service] || "🐕"} {b.dogs?.name || "Unknown"}
                                <span style={{ fontWeight: 400, color: BRAND.textLight }}> ({b.dogs?.breed})</span>
                              </div>
                              <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 2 }}>
                                {SERVICE_LABELS[b.service] || b.service}
                              </div>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: sc.bg, color: sc.text }}>
                              {b.status}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: BRAND.text }}>
                            📅 {formatDate(b.booking_date)} at {formatSlot(b.slot)}
                          </div>
                          {b.booking_date > today && b.status === "Not Arrived" && (
                            <button onClick={() => handleCancelBooking(b.id)} style={{
                              marginTop: 10, width: "100%", padding: "8px", borderRadius: 8,
                              border: `1px solid ${BRAND.coral}`, background: "transparent",
                              fontSize: 13, fontWeight: 600, color: BRAND.coral,
                              cursor: "pointer", fontFamily: "inherit",
                            }}>Cancel appointment</button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                {past.length > 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 20 }}>Past</div>
                    {past.slice(0, 5).map(b => (
                      <div key={b.id} style={{ ...cardStyle, opacity: 0.7 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>
                          {b.dogs?.name} — {SERVICE_LABELS[b.service] || b.service}
                        </div>
                        <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>
                          {formatDate(b.booking_date)} at {formatSlot(b.slot)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
        {/* DOGS TAB */}
        {activeTab === "dogs" && (
          <div>
            {dogs.length === 0 ? (
              <div style={cardStyle}>
                <div style={{ textAlign: "center", padding: 20, color: BRAND.textLight }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🐕</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>No dogs on file</div>
                  <div style={{ fontSize: 13 }}>Ask the salon to add your dog to the system.</div>
                </div>
              </div>
            ) : (
              dogs.map(dog => (
                <div key={dog.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>{dog.name}</div>
                      <div style={{ fontSize: 13, color: BRAND.textLight }}>{dog.breed}{dog.age ? ` · ${dog.age}` : ""}</div>
                    </div>
                    {dog.size && (
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                        background: dog.size === "large" ? "#FDE2E8" : dog.size === "medium" ? "#D6F5EE" : "#FEF3C7",
                        color: dog.size === "large" ? BRAND.coral : dog.size === "medium" ? "#065F46" : "#92400E",
                      }}>{dog.size}</span>
                    )}
                  </div>
                  {dog.groom_notes && (
                    <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 8, padding: "8px 10px", background: "#F9FAFB", borderRadius: 6 }}>
                      {dog.groom_notes}
                    </div>
                  )}
                  {dog.alerts && dog.alerts.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {dog.alerts.map((a, i) => (
                        <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "#FEE2E2", color: "#991B1B" }}>⚠️ {a}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        {/* DETAILS TAB */}
        {activeTab === "details" && (
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>{humanName}</div>
              {!editingDetails && (
                <button onClick={() => setEditingDetails(true)} style={{
                  background: BRAND.teal, border: "none", borderRadius: 8, padding: "6px 14px",
                  fontSize: 13, fontWeight: 700, color: BRAND.white, cursor: "pointer", fontFamily: "inherit",
                }}>Edit</button>
              )}
            </div>

            {editingDetails ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Phone</label>
                  <input value={details.phone} onChange={e => setDetails(d => ({ ...d, phone: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Email</label>
                  <input value={details.email} onChange={e => setDetails(d => ({ ...d, email: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Address</label>
                  <textarea value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))} rows={2}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleSaveDetails} style={{
                    flex: 1, padding: "10px", borderRadius: 8, border: "none", background: BRAND.teal,
                    color: BRAND.white, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>Save</button>
                  <button onClick={() => setEditingDetails(false)} style={{
                    flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`,
                    background: BRAND.white, color: BRAND.textLight, fontSize: 14, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><span style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight }}>PHONE</span><div style={{ fontSize: 14, color: BRAND.text }}>{humanRecord?.phone || "—"}</div></div>
                <div><span style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight }}>EMAIL</span><div style={{ fontSize: 14, color: BRAND.text }}>{humanRecord?.email || "—"}</div></div>
                <div><span style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight }}>ADDRESS</span><div style={{ fontSize: 14, color: BRAND.text }}>{humanRecord?.address || "—"}</div></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
