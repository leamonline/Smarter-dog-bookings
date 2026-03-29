import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { BRAND } from "../../constants/index.js";
import { toDateStr } from "../../supabase/transforms.js";

const SERVICE_LABELS = {
  "full-groom": "Full Groom",
  "bath-and-brush": "Bath & Brush",
  "bath-and-deshed": "Bath & Deshed",
  "puppy-groom": "Puppy Groom",
  "nail-trim": "Nail Trim",
};

const SERVICE_ICONS = {
  "full-groom": "\u2702\uFE0F",
  "bath-and-brush": "\uD83D\uDEC1",
  "bath-and-deshed": "\uD83E\uDDF9",
  "puppy-groom": "\uD83D\uDC3E",
  "nail-trim": "\u2702\uFE0F",
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

function formatSlot(slot) {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function CustomerDashboard({ humanRecord, onSignOut }) {
  const navigate = useNavigate();
  const [dogs, setDogs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [trustedHumans, setTrustedHumans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState({
    name: humanRecord?.name || "",
    surname: humanRecord?.surname || "",
    address: humanRecord?.address || "",
    email: humanRecord?.email || "",
    whatsapp: humanRecord?.whatsapp || false,
    fb: humanRecord?.fb || "",
    insta: humanRecord?.insta || "",
    tiktok: humanRecord?.tiktok || "",
  });

  const humanName = `${humanRecord?.name || ""} ${humanRecord?.surname || ""}`.trim();

  // Fetch dogs, bookings, trusted humans
  useEffect(() => {
    if (!supabase || !humanRecord?.id) { setLoading(false); return; }

    async function fetchData() {
      // Dogs
      const { data: dogRows } = await supabase
        .from("dogs")
        .select("*")
        .eq("human_id", humanRecord.id)
        .order("name");
      setDogs(dogRows || []);

      // Bookings (last 60 days + future)
      const dogIds = (dogRows || []).map(d => d.id);
      if (dogIds.length > 0) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 60);
        const pastStr = toDateStr(pastDate);

        const { data: bookingRows } = await supabase
          .from("bookings")
          .select("*, dogs(name, breed, size)")
          .in("dog_id", dogIds)
          .gte("booking_date", pastStr)
          .order("booking_date", { ascending: false })
          .order("slot", { ascending: false });
        setBookings(bookingRows || []);
      }

      // Trusted humans from the dedicated junction table
      const { data: trustedLinks } = await supabase
        .from("human_trusted_contacts")
        .select("trusted_id, humans!human_trusted_contacts_trusted_id_fkey(id, name, surname, phone)")
        .eq("human_id", humanRecord.id);

      if (trustedLinks) {
        setTrustedHumans(
          trustedLinks
            .map(link => link.humans)
            .filter(Boolean)
        );
      }

      setLoading(false);
    }
    fetchData();
  }, [humanRecord]);

  // Save details
  const handleSave = useCallback(async () => {
    if (!supabase || !humanRecord?.id) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("humans")
      .update({
        name: details.name,
        surname: details.surname,
        address: details.address,
        email: details.email,
        whatsapp: details.whatsapp,
        fb: details.fb,
        insta: details.insta,
        tiktok: details.tiktok,
      })
      .eq("id", humanRecord.id);
    setSaving(false);
    if (!err) setEditing(false);
  }, [humanRecord, details]);

  // Cancel editing — reset to original values
  const handleCancel = useCallback(() => {
    setDetails({
      name: humanRecord?.name || "",
      surname: humanRecord?.surname || "",
      address: humanRecord?.address || "",
      email: humanRecord?.email || "",
      whatsapp: humanRecord?.whatsapp || false,
      fb: humanRecord?.fb || "",
      insta: humanRecord?.insta || "",
      tiktok: humanRecord?.tiktok || "",
    });
    setEditing(false);
  }, [humanRecord]);

  // Cancel a booking — with client-side ownership guard and group booking support
  const handleCancelBooking = useCallback(async (bookingId) => {
    if (!supabase) return;

    // Verify this booking belongs to one of the user's dogs
    const dogIds = dogs.map(d => d.id);
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking || !dogIds.includes(booking.dog_id)) return;

    // Check if this booking is part of a group
    if (booking.group_id) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("group_id", booking.group_id)
        .neq("id", bookingId);

      const otherGroupBookings = groupBookings || [];

      if (otherGroupBookings.length > 0) {
        const totalInGroup = otherGroupBookings.length + 1;
        const cancelAll = window.confirm(
          `This booking is part of a group of ${totalInGroup} dogs. Cancel all bookings in this group, or just this one?\n\nOK = Cancel all\nCancel = Just this one`
        );

        if (cancelAll) {
          // Delete all bookings with this group_id
          const { error: err } = await supabase
            .from("bookings")
            .delete()
            .eq("group_id", booking.group_id);
          if (!err) {
            const groupIds = new Set([bookingId, ...otherGroupBookings.map(b => b.id)]);
            setBookings(prev => prev.filter(b => !groupIds.has(b.id)));
          }
          return;
        }
        // If they clicked Cancel in the dialog, fall through to single deletion below
      }
    }

    // Single booking cancellation (no group, or user chose "just this one")
    if (!booking.group_id) {
      if (!window.confirm("Are you sure you want to cancel this appointment?")) return;
    }
    const { error: err } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (!err) {
      setBookings(prev => prev.filter(b => b.id !== bookingId));
    }
  }, [dogs, bookings]);

  const today = toDateStr(new Date());

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8FFFE", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
        <div style={{ textAlign: "center", color: BRAND.textLight }}>Loading your dashboard...</div>
      </div>
    );
  }

  // Shared styles
  const cardStyle = {
    background: BRAND.white, borderRadius: 14, padding: "20px 24px",
    border: `1px solid ${BRAND.greyLight}`, marginBottom: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  };

  const sectionTitle = (text) => (
    <div style={{ fontWeight: 800, fontSize: 12, color: BRAND.teal, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>{text}</div>
  );

  const detailRow = (label, value, isEditing, editComponent) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <span style={{ fontSize: 14, color: BRAND.textLight, minWidth: 100 }}>{label}</span>
      {isEditing ? editComponent : (
        <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text, textAlign: "right", flex: 1, marginLeft: 12 }}>{value || "\u2014"}</span>
      )}
    </div>
  );

  const inputStyle = {
    flex: 1, marginLeft: 12, padding: "8px 12px", borderRadius: 8,
    border: `1.5px solid ${BRAND.teal}`, fontSize: 14, fontFamily: "inherit",
    boxSizing: "border-box", outline: "none", color: BRAND.text,
    textAlign: "right",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FFFE", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* Header bar */}
      <div style={{
        background: `linear-gradient(135deg, ${BRAND.teal}, #236b5d)`,
        padding: "20px 20px 28px", position: "relative",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
              Smarter<span style={{ color: BRAND.white }}>Dog</span> Customer Portal
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.white }}>{humanName}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{humanRecord?.phone || ""}</div>
          </div>
          <button onClick={() => {
            if (editing && !window.confirm("You have unsaved changes. Sign out anyway?")) return;
            onSignOut();
          }} style={{
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
            color: BRAND.white, cursor: "pointer", fontFamily: "inherit",
            backdropFilter: "blur(4px)",
          }}>Log out</button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "-12px auto 0", padding: "0 16px 32px", position: "relative", zIndex: 1 }}>

        <button
          onClick={() => navigate("/customer/book")}
          style={{
            width: "100%", padding: "16px", borderRadius: 12, border: "none",
            background: BRAND.teal, color: BRAND.white, fontSize: 16, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", marginBottom: 20,
          }}
        >
          Book a Groom
        </button>

        {/* ==================== MY DETAILS ==================== */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            {sectionTitle("My Details")}
            {!editing ? (
              <button onClick={() => setEditing(true)} style={{
                background: BRAND.teal, border: "none", borderRadius: 8, padding: "6px 16px",
                fontSize: 13, fontWeight: 700, color: BRAND.white, cursor: "pointer", fontFamily: "inherit",
              }}>Edit</button>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleSave} disabled={saving} style={{
                  background: BRAND.teal, border: "none", borderRadius: 8, padding: "6px 16px",
                  fontSize: 13, fontWeight: 700, color: BRAND.white, cursor: "pointer", fontFamily: "inherit",
                  opacity: saving ? 0.6 : 1,
                }}>{saving ? "Saving..." : "Save"}</button>
                <button onClick={handleCancel} style={{
                  background: BRAND.white, border: `1px solid ${BRAND.greyLight}`, borderRadius: 8,
                  padding: "6px 14px", fontSize: 13, fontWeight: 600, color: BRAND.textLight,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Cancel</button>
              </div>
            )}
          </div>

          {/* First Name + Surname */}
          {editing ? (
            <div style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", marginBottom: 4 }}>First Name</div>
                <input value={details.name} onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
                  style={{ ...inputStyle, flex: undefined, width: "100%", marginLeft: 0, textAlign: "left" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", marginBottom: 4 }}>Surname</div>
                <input value={details.surname} onChange={e => setDetails(d => ({ ...d, surname: e.target.value }))}
                  style={{ ...inputStyle, flex: undefined, width: "100%", marginLeft: 0, textAlign: "left" }} />
              </div>
            </div>
          ) : (
            detailRow("Name", `${details.name} ${details.surname}`.trim(), false, null)
          )}

          {/* Address */}
          {detailRow("Address", details.address, editing,
            <input value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))} style={inputStyle} />
          )}

          {/* Email */}
          {detailRow("Email", details.email, editing,
            <input type="email" value={details.email} onChange={e => setDetails(d => ({ ...d, email: e.target.value }))} style={inputStyle} />
          )}

          {/* WhatsApp toggle */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
            <span style={{ fontSize: 14, color: BRAND.textLight }}>WhatsApp</span>
            {editing ? (
              <button onClick={() => setDetails(d => ({ ...d, whatsapp: !d.whatsapp }))} style={{
                background: details.whatsapp ? BRAND.teal : BRAND.greyLight,
                border: "none", borderRadius: 20, width: 48, height: 26, cursor: "pointer",
                position: "relative", transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: 3, left: details.whatsapp ? 25 : 3,
                  width: 20, height: 20, borderRadius: "50%", background: BRAND.white,
                  transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: details.whatsapp ? BRAND.teal : BRAND.coral }}>
                {details.whatsapp ? "\u2705 Active" : "\u274C Off"}
              </span>
            )}
          </div>

          {/* Facebook */}
          {detailRow("Facebook", details.fb, editing,
            <input value={details.fb} onChange={e => setDetails(d => ({ ...d, fb: e.target.value }))} placeholder="facebook.com/..." style={inputStyle} />
          )}

          {/* Instagram */}
          {detailRow("Instagram", details.insta ? `@${details.insta.replace(/^@/, "")}` : "", editing,
            <input value={details.insta} onChange={e => setDetails(d => ({ ...d, insta: e.target.value }))} placeholder="@handle" style={inputStyle} />
          )}

          {/* TikTok */}
          {detailRow("TikTok", details.tiktok ? `@${details.tiktok.replace(/^@/, "")}` : "", editing,
            <input value={details.tiktok} onChange={e => setDetails(d => ({ ...d, tiktok: e.target.value }))} placeholder="@handle" style={inputStyle} />
          )}
        </div>

        {/* ==================== DOGS ==================== */}
        <div style={cardStyle}>
          {sectionTitle("Dogs")}
          {dogs.length === 0 ? (
            <div style={{ fontSize: 14, color: BRAND.textLight, fontStyle: "italic", padding: "8px 0" }}>No dogs on file</div>
          ) : (
            dogs.map(dog => (
              <div key={dog.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>{dog.name}</div>
                  <div style={{ fontSize: 13, color: BRAND.textLight }}>
                    {dog.breed}{dog.size ? ` \u00B7 ${dog.size}` : ""}
                  </div>
                  {dog.groom_notes && (
                    <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4, padding: "4px 8px", background: "#F9FAFB", borderRadius: 4 }}>
                      {dog.groom_notes}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {dog.size && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      background: dog.size === "large" ? "#FDE2E8" : dog.size === "medium" ? "#D6F5EE" : "#FEF3C7",
                      color: dog.size === "large" ? BRAND.coral : dog.size === "medium" ? "#065F46" : "#92400E",
                    }}>{dog.size}</span>
                  )}
                  {dog.alerts && dog.alerts.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.coral }}>{"\u26A0\uFE0F"} {dog.alerts.length} alert{dog.alerts.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ==================== TRUSTED HUMANS ==================== */}
        <div style={cardStyle}>
          {sectionTitle("Trusted Humans")}
          {trustedHumans.length === 0 ? (
            <div style={{ fontSize: 14, color: BRAND.textLight, fontStyle: "italic", padding: "8px 0" }}>None listed</div>
          ) : (
            trustedHumans.map(th => (
              <div key={th.id} style={{ padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{th.name} {th.surname}</div>
                <div style={{ fontSize: 12, color: BRAND.textLight }}>{th.phone}</div>
              </div>
            ))
          )}
          <div style={{
            marginTop: 12, padding: "10px", borderRadius: 10, border: `1.5px dashed ${BRAND.teal}`,
            background: BRAND.tealLight, color: BRAND.teal, fontSize: 13, fontWeight: 700,
            textAlign: "center",
          }}>
            Contact the salon to add a trusted human
          </div>
        </div>

        {/* ==================== RECENT BOOKINGS ==================== */}
        <div style={cardStyle}>
          {sectionTitle("Recent Bookings")}
          {bookings.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{"\uD83D\uDC3E"}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 2 }}>No bookings yet</div>
              <div style={{ fontSize: 13, color: BRAND.textLight }}>Give the salon a call to book your first appointment!</div>
            </div>
          ) : (
            bookings.slice(0, 10).map(b => {
              const sc = STATUS_COLOURS[b.status] || STATUS_COLOURS["Not Arrived"];
              const isFuture = b.booking_date >= today;
              const canCancel = isFuture && b.status === "Not Arrived";

              return (
                <div key={b.id} style={{
                  padding: "12px 0", borderBottom: `1px solid ${BRAND.greyLight}`,
                  opacity: isFuture ? 1 : 0.7,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>
                          {formatDate(b.booking_date)}
                        </span>
                        {isFuture && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: BRAND.tealLight, color: BRAND.teal }}>UPCOMING</span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: BRAND.text, marginTop: 2 }}>
                        {b.dogs?.name || "Unknown"}{" "}
                        <span style={{ color: BRAND.textLight }}>{SERVICE_ICONS[b.service] || ""} {SERVICE_LABELS[b.service] || b.service}</span>
                      </div>
                      {b.slot && (
                        <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>
                          {formatSlot(b.slot)}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                      background: sc.bg, color: sc.text, whiteSpace: "nowrap",
                    }}>{b.status}</span>
                  </div>
                  {canCancel && (
                    <button onClick={() => handleCancelBooking(b.id)} style={{
                      marginTop: 8, width: "100%", padding: "8px", borderRadius: 8,
                      border: `1px solid ${BRAND.coral}`, background: "transparent",
                      fontSize: 13, fontWeight: 600, color: BRAND.coral,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>Cancel appointment</button>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
