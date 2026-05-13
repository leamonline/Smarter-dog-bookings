import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { toDateStr } from "../../supabase/transforms.js";
import { MyDetailsCard } from "./MyDetailsCard.jsx";
import { DogsSection } from "./DogsSection.jsx";
import { TrustedHumansSection } from "./TrustedHumansSection.jsx";
import { AppointmentsSection } from "./AppointmentsSection.jsx";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { PawPrint, ArrowRight, Phone } from "lucide-react";

export function CustomerDashboard({ humanRecord, onSignOut }) {
  const navigate = useNavigate();
  const [dogs, setDogs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [trustedHumans, setTrustedHumans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [olderBookings, setOlderBookings] = useState([]);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOther, setCancelOther] = useState("");
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [loadError, setLoadError] = useState(null);
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
    let cancelled = false;

    async function fetchData() {
      try {
        const { data: dogRows, error: dogErr } = await supabase
          .from("dogs")
          .select("*")
          .eq("human_id", humanRecord.id)
          .order("name");
        if (dogErr) throw dogErr;
        if (cancelled) return;
        setDogs(dogRows || []);

        const dogIds = (dogRows || []).map(d => d.id);
        if (dogIds.length > 0) {
          const pastDate = new Date();
          pastDate.setDate(pastDate.getDate() - 180);
          const pastStr = toDateStr(pastDate);

          const { data: bookingRows, error: bookErr } = await supabase
            .from("bookings")
            .select("*, dogs(name, breed, size)")
            .in("dog_id", dogIds)
            .gte("booking_date", pastStr)
            .order("booking_date", { ascending: false })
            .order("slot", { ascending: false });
          if (bookErr) throw bookErr;
          if (cancelled) return;
          setBookings(bookingRows || []);

          const { count } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .in("dog_id", dogIds)
            .lt("booking_date", pastStr);
          if (!cancelled) setHasMorePast((count || 0) > 0);
        }

        const { data: trustedLinks, error: trustedErr } = await supabase
          .from("human_trusted_contacts")
          .select("trusted_id, relationship, humans!human_trusted_contacts_trusted_id_fkey(id, name, surname, phone)")
          .eq("human_id", humanRecord.id);
        if (trustedErr) throw trustedErr;

        if (!cancelled && trustedLinks) {
          setTrustedHumans(
            trustedLinks
              .map(link => link.humans ? { ...link.humans, relationship: link.relationship || "" } : null)
              .filter(Boolean)
          );
        }
      } catch (err) {
        console.error("CustomerDashboard fetch failed:", err);
        if (!cancelled) setLoadError(err?.message || "We couldn't load your details. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
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
    const rawReason = cancelReason === "Other" ? cancelOther.trim() : cancelReason;
    const reason = rawReason.replace(/<[^>]*>/g, "").slice(0, 500);
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

  if (loading) {
    return (
      <div className="portal-loading">
        <PawPrint size={40} className="portal-loading-icon" />
        <div className="portal-loading-text">Just a sec, fetching your details\u2026</div>
      </div>
    );
  }

  const requestSignOut = () => {
    if (editing) { setShowSignOutConfirm(true); return; }
    onSignOut();
  };
  const firstName = (humanRecord?.name || humanName || "there").trim().split(" ")[0];
  const handleBook = () => navigate("/customer/book");

  return (
    <div className="customer-portal">
      <a href="#main-content" className="portal-skip-link">Skip to content</a>

      {/* ===== TOP NAV (matches marketing site) ===== */}
      <nav className="portal-topnav" aria-label="Primary">
        <div className="portal-topnav-inner">
          <a href="https://smarterdog.co.uk" className="portal-topnav-logo" aria-label="Smarter Dog home">
            <img src="/logo.png" alt="Smarter Dog Grooming" />
          </a>
          <div className="portal-topnav-links">
            <a className="portal-topnav-link--hide-sm" href="https://smarterdog.co.uk/#services">Services</a>
            <a className="portal-topnav-link--hide-sm" href="https://smarterdog.co.uk/#faq">FAQ</a>
            <a className="portal-topnav-link--hide-sm" href="https://smarterdog.co.uk/houndsly">Houndsly</a>
            <button type="button" onClick={requestSignOut}>Sign out</button>
          </div>
        </div>
      </nav>

      {/* ===== WELCOME + CTA (inline on desktop, stacked on mobile) ===== */}
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-header-row">
            <div className="portal-header-text">
              <h1 className="portal-welcome">
                Hi,&nbsp;
                <span className="portal-welcome-name">
                  {firstName}
                  <svg
                    className="portal-welcome-underline"
                    viewBox="0 0 200 14"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 10 C 40 3, 80 13, 120 7 S 180 3, 198 9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
              <p className="portal-tagline">Smarter grooming, Smarter Dog!</p>
            </div>
            <button
              className="portal-btn portal-btn--cta portal-btn--cta-header"
              onClick={handleBook}
            >
              <PawPrint size={18} aria-hidden="true" />
              Book a Groom
              <ArrowRight size={18} aria-hidden="true" className="portal-btn-arrow" />
            </button>
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main id="main-content" className="portal-main">
        <div className="portal-content">

          {loadError && (
            <div role="alert" className="portal-section--full mb-3 py-3 px-4 rounded-xl bg-pink-50 border border-pink-200 text-brand-coral text-sm font-semibold text-center">
              {loadError}
            </div>
          )}

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

          <DogsSection dogs={dogs} onBook={handleBook} />

          <TrustedHumansSection
            trustedHumans={trustedHumans}
            onAdded={(row) =>
              setTrustedHumans(prev =>
                prev.some(t => t.id === row.id) ? prev : [...prev, row]
              )
            }
          />

          <div className="portal-section--full">
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
              onSubscribe={() => setShowCalendarModal(true)}
              onBook={handleBook}
            />
          </div>

        </div>

        {/* Footer with brand tagline + phone */}
        <footer className="portal-footer">
          <p className="portal-footer-tagline">Smarter grooming, Smarter Dog!</p>
          <a className="portal-footer-phone" href="tel:07507731487" aria-label="Call Smarter Dog on 07507 731487">
            <Phone size={16} aria-hidden="true" />
            07507 731487
          </a>
        </footer>
      </main>

      {/* Sticky mobile CTA — highest-value action */}
      <div className="portal-sticky-cta">
        <button className="portal-btn portal-btn--cta" onClick={handleBook}>
          <PawPrint size={18} aria-hidden="true" />
          Book a Groom
          <ArrowRight size={18} aria-hidden="true" className="portal-btn-arrow" />
        </button>
      </div>

      {showCalendarModal && (
        <CalendarSubscribeModal onClose={() => setShowCalendarModal(false)} />
      )}

      {showSignOutConfirm && (
        <ConfirmDialog
          title="Unsaved changes"
          message="You have unsaved changes. Sign out anyway?"
          confirmLabel="Sign out"
          variant="danger"
          onConfirm={() => { setShowSignOutConfirm(false); onSignOut(); }}
          onCancel={() => setShowSignOutConfirm(false)}
        />
      )}
    </div>
  );
}
