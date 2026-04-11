import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { toDateStr } from "../../supabase/transforms.js";
import { POLAROID_COLORS, POLAROID_ROTATIONS } from "./dashboardConstants.js";
import { MyDetailsCard } from "./MyDetailsCard.jsx";
import { DogsSection } from "./DogsSection.jsx";
import { TrustedHumansSection } from "./TrustedHumansSection.jsx";
import { AppointmentsSection } from "./AppointmentsSection.jsx";

export function CustomerDashboard({ humanRecord, onSignOut }) {
  const navigate = useNavigate();
  const [dogs, setDogs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [trustedHumans, setTrustedHumans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [olderBookings, setOlderBookings] = useState([]);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOther, setCancelOther] = useState("");
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

  useEffect(() => {
    if (!supabase || !humanRecord?.id) { setLoading(false); return; }

    async function fetchData() {
      const { data: dogRows } = await supabase
        .from("dogs")
        .select("*")
        .eq("human_id", humanRecord.id)
        .order("name");
      setDogs(dogRows || []);

      const dogIds = (dogRows || []).map(d => d.id);
      if (dogIds.length > 0) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 180);
        const pastStr = toDateStr(pastDate);

        const { data: bookingRows } = await supabase
          .from("bookings")
          .select("*, dogs(name, breed, size)")
          .in("dog_id", dogIds)
          .gte("booking_date", pastStr)
          .order("booking_date", { ascending: false })
          .order("slot", { ascending: false });
        setBookings(bookingRows || []);

        const { count } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("dog_id", dogIds)
          .lt("booking_date", pastStr);
        setHasMorePast((count || 0) > 0);
      }

      const { data: trustedLinks } = await supabase
        .from("human_trusted_contacts")
        .select("trusted_id, humans!human_trusted_contacts_trusted_id_fkey(id, name, surname, phone)")
        .eq("human_id", humanRecord.id);

      if (trustedLinks) {
        setTrustedHumans(
          trustedLinks.map(link => link.humans).filter(Boolean)
        );
      }

      setLoading(false);
    }
    fetchData();
  }, [humanRecord]);

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

  const startCancel = useCallback((bookingId) => {
    setCancellingId(bookingId);
    setCancelReason("");
    setCancelOther("");
  }, []);

  const confirmCancel = useCallback(async () => {
    if (!supabase || !cancellingId) return;
    const reason = cancelReason === "Other" ? cancelOther.trim() : cancelReason;
    if (!reason) return;

    const booking = bookings.find(b => b.id === cancellingId);
    if (!booking) return;

    setSaving(true);

    if (booking.group_id) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("group_id", booking.group_id);

      const ids = (groupBookings || []).map(b => b.id);
      const { error: err } = await supabase
        .from("bookings")
        .update({ status: "Cancelled", cancel_reason: reason })
        .in("id", ids);
      if (!err) {
        setBookings(prev => prev.map(b =>
          ids.includes(b.id) ? { ...b, status: "Cancelled", cancel_reason: reason } : b
        ));
      }
    } else {
      const { error: err } = await supabase
        .from("bookings")
        .update({ status: "Cancelled", cancel_reason: reason })
        .eq("id", cancellingId);
      if (!err) {
        setBookings(prev => prev.map(b =>
          b.id === cancellingId ? { ...b, status: "Cancelled", cancel_reason: reason } : b
        ));
      }
    }

    setSaving(false);
    setCancellingId(null);
    setCancelReason("");
    setCancelOther("");
  }, [cancellingId, cancelReason, cancelOther, bookings]);

  const handleLoadMore = useCallback(async () => {
    if (!supabase) return;
    const dogIds = dogs.map(d => d.id);
    if (dogIds.length === 0) return;
    setLoadingMore(true);
    const alreadyLoaded = [...bookings, ...olderBookings];
    const oldestDate = alreadyLoaded.reduce((min, b) => b.booking_date < min ? b.booking_date : min, alreadyLoaded[0]?.booking_date || toDateStr(new Date()));
    const { data: moreRows } = await supabase
      .from("bookings")
      .select("*, dogs(name, breed, size)")
      .in("dog_id", dogIds)
      .lt("booking_date", oldestDate)
      .order("booking_date", { ascending: false })
      .order("slot", { ascending: false })
      .limit(20);
    setOlderBookings(prev => [...prev, ...(moreRows || [])]);
    if (!moreRows || moreRows.length < 20) setHasMorePast(false);
    setLoadingMore(false);
  }, [dogs, bookings, olderBookings]);

  const today = toDateStr(new Date());

  const upcomingBookings = useMemo(() =>
    bookings.filter(b => b.booking_date >= today && b.status !== "Cancelled")
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.slot.localeCompare(b.slot)),
    [bookings, today]
  );

  const pastBookings = useMemo(() =>
    [...bookings.filter(b => b.booking_date < today), ...olderBookings]
      .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.slot.localeCompare(a.slot)),
    [bookings, olderBookings, today]
  );

  /* =========== Loading state =========== */
  if (loading) {
    return (
      <div className="portal-loading">
        <div className="portal-loading-paw">{"\uD83D\uDC3E"}</div>
        <div className="portal-loading-text">Loading your dashboard...</div>
      </div>
    );
  }

  /* =========== Main render =========== */
  return (
    <div className="customer-portal">

      {/* ===== BLUE HEADER ===== */}
      <div className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-header-top">
            <div className="portal-brand">
              Smarter<span>Dog</span>
            </div>
            <div className="portal-nav">
              <span className="portal-nav-link">{"\u2702\uFE0F"} Services</span>
              <span className="portal-nav-link">{"\uD83D\uDCB7"} Pricing</span>
            </div>
          </div>
          <div className="portal-header-bottom">
            <div>
              <h1 className="portal-welcome">{humanName}</h1>
              <p className="portal-phone">{humanRecord?.phone || ""}</p>
            </div>
            <button
              className="wobbly-btn wobbly-btn--logout"
              onClick={() => {
                if (editing && !window.confirm("You have unsaved changes. Sign out anyway?")) return;
                onSignOut();
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* Wave: Blue -> Coral */}
      <svg className="portal-wave" viewBox="0 0 1440 60" preserveAspectRatio="none" style={{ background: "#00C2FF" }}>
        <path d="M0,30 C240,55 480,5 720,30 C960,55 1200,5 1440,30 L1440,60 L0,60 Z" fill="#E8506A" />
      </svg>

      {/* ===== MAGENTA MAIN ===== */}
      <div className="portal-main">
        <div className="portal-content">

          {/* Book a Groom */}
          <button
            className="wobbly-btn wobbly-btn--book"
            onClick={() => navigate("/customer/book")}
          >
            {"\uD83D\uDC3E"} Book a Groom
          </button>

          <MyDetailsCard
            editing={editing}
            setEditing={setEditing}
            saving={saving}
            details={details}
            setDetails={setDetails}
            humanRecord={humanRecord}
            onSave={handleSave}
            onCancel={handleCancel}
          />

          <DogsSection dogs={dogs} />

          <TrustedHumansSection trustedHumans={trustedHumans} />

          <AppointmentsSection
            upcomingBookings={upcomingBookings}
            pastBookings={pastBookings}
            pastExpanded={pastExpanded}
            setPastExpanded={setPastExpanded}
            hasMorePast={hasMorePast}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            cancellingId={cancellingId}
            cancelReason={cancelReason}
            setCancelReason={setCancelReason}
            cancelOther={cancelOther}
            setCancelOther={setCancelOther}
            saving={saving}
            onStartCancel={startCancel}
            onConfirmCancel={confirmCancel}
            onCancelBack={() => setCancellingId(null)}
          />

        </div>
      </div>

      {/* Wave: Coral -> Yellow */}
      <svg className="portal-wave" viewBox="0 0 1440 60" preserveAspectRatio="none" style={{ background: "#E8506A" }}>
        <path d="M0,20 C360,50 720,0 1080,40 C1260,20 1380,45 1440,25 L1440,60 L0,60 Z" fill="#FFCC00" />
      </svg>

      {/* ===== YELLOW FOOTER ===== */}
      <div className="portal-footer">
        <div className="portal-footer-inner">
          <div className="portal-footer-title">{"\uD83D\uDC3E"} My Pack</div>
          <div className="dog-prints-row">
            {dogs.length > 0 ? dogs.map((dog, i) => (
              <div
                key={dog.id}
                className="dog-polaroid"
                style={{ "--polaroid-rotation": `${POLAROID_ROTATIONS[i % POLAROID_ROTATIONS.length]}deg` }}
              >
                <div
                  className="polaroid-image"
                  style={{ background: POLAROID_COLORS[i % POLAROID_COLORS.length] }}
                >
                  {dog.name[0]}
                </div>
                <div className="polaroid-name">{dog.name}</div>
              </div>
            )) : (
              <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: "14px", fontWeight: 600, color: "#5C4600" }}>
                No dogs added yet
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
