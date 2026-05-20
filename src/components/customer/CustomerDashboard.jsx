import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { toDateStr } from "../../supabase/transforms.js";
import { MyDetailsCard } from "./MyDetailsCard.jsx";
import { DogsSection } from "./DogsSection.jsx";
import { TrustedHumansSection } from "./TrustedHumansSection.jsx";
import { AppointmentsSection } from "./AppointmentsSection.jsx";
import { BookingCard } from "./BookingCard.jsx";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { PawPrint, Phone, Clock } from "lucide-react";
import { ALL_DAYS } from "../../constants/salon.js";

const OVERDUE_DAYS = 42; // 6 weeks; the 'due for another?' threshold.
// Trading hours, surfaced in the footer + booking flow. Hard-coded for now —
// promote to salon config when we have somewhere sensible to put it.
const SALON_OPEN_LABEL = "8:30am–3pm";

export function CustomerDashboard({ humanRecord, onSignOut }) {
  const navigate = useNavigate();
  const [dogs, setDogs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [trustedHumans, setTrustedHumans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [olderBookings, setOlderBookings] = useState([]);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
  }, [humanRecord, refreshKey]);

  const handleSave = useCallback(async () => {
    if (!supabase || !humanRecord?.id) return;
    setSaving(true);
    setSaveError(null);
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
    if (err) {
      setSaveError(
        err?.message
          ? `We couldn't save your changes: ${err.message}. Try again, or refresh if it keeps failing.`
          : "We couldn't save your changes. Try again, or refresh if it keeps failing.",
      );
      return;
    }
    setEditing(false);
  }, [humanRecord, details]);

  const handleCancel = useCallback(() => {
    setSaveError(null);
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
      .filter(b => b.status !== "Cancelled")
      .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.slot.localeCompare(a.slot)),
    [bookings, olderBookings, today]
  );

  // Status line — shown beneath the welcome tagline. Three flavours:
  //   • next groom upcoming  → neutral ("Next groom: …")
  //   • last groom ≥ 6 weeks → amber ("Alfie's last groom was X — due for another?")
  //   • last groom < 6 weeks → mute  ("Alfie's last groom was X weeks ago")
  const statusLine = useMemo(() => {
    if (upcomingBookings.length > 0) {
      const next = upcomingBookings[0];
      const d = new Date(next.booking_date + "T00:00:00");
      const dayLabel = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      const [h, m] = next.slot.split(":").map(Number);
      const suffix = h >= 12 ? "pm" : "am";
      const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return {
        tone: "neutral",
        text: `Next groom: ${dayLabel}, ${hour}:${m.toString().padStart(2, "0")}${suffix}`,
      };
    }
    if (pastBookings.length === 0) return null;
    const last = pastBookings[0];
    const lastDog = last.dogs?.name || dogs[0]?.name || "your pup";
    const lastDate = new Date(last.booking_date + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((today - lastDate) / 86400000);
    const weeksAgo = Math.max(1, Math.round(daysAgo / 7));
    const friendlyDate = lastDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (daysAgo >= OVERDUE_DAYS) {
      return {
        tone: "amber",
        text: `${lastDog}'s last groom was ${friendlyDate} — due for another?`,
      };
    }
    return {
      tone: "mute",
      text: `${lastDog}'s last groom was ${weeksAgo} ${weeksAgo === 1 ? "week" : "weeks"} ago.`,
    };
  }, [upcomingBookings, pastBookings, dogs]);

  // Pre-compute "last groom" per dog for DogsSection.
  const lastGroomByDog = useMemo(() => {
    const map = {};
    for (const b of pastBookings) {
      if (!b.dog_id || map[b.dog_id]) continue;
      map[b.dog_id] = b.booking_date;
    }
    return map;
  }, [pastBookings]);

  const refreshBookings = () => setRefreshKey(k => k + 1);

  if (loading) {
    return (
      <div className="portal-loading">
        <PawPrint size={40} className="portal-loading-icon" />
        <div className="portal-loading-text">Just a sec, fetching your details…</div>
      </div>
    );
  }

  const requestSignOut = () => {
    if (editing) { setShowSignOutConfirm(true); return; }
    onSignOut();
  };
  const firstName = (humanRecord?.name || humanName || "there").trim().split(" ")[0];
  const handleBook = () => navigate("/customer/book");

  // Footer hours line, derived from salon defaults so it stays accurate
  // when default-open days change in salon.ts.
  const openDays = ALL_DAYS.filter(d => d.defaultOpen);
  const hoursLabel = openDays.length === 0
    ? "Hours by appointment"
    : openDays.length === 7
      ? `Open every day, ${SALON_OPEN_LABEL}`
      : (() => {
          const indices = openDays.map(d => ALL_DAYS.findIndex(x => x.key === d.key));
          const contiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
          if (contiguous && openDays.length > 1) {
            return `${openDays[0].label}–${openDays[openDays.length - 1].label}, ${SALON_OPEN_LABEL}`;
          }
          return `${openDays.map(d => d.label).join(", ")}, ${SALON_OPEN_LABEL}`;
        })();

  return (
    <div className="customer-portal">
      <a href="#main-content" className="portal-skip-link">Skip to content</a>

      {/* ===== TOP NAV (no in-header CTA — the in-page Booking card carries the action) ===== */}
      <nav className="portal-topnav" aria-label="Primary">
        <div className="portal-topnav-inner">
          <a href="https://smarterdog.co.uk" target="_blank" rel="noopener noreferrer" className="portal-topnav-logo" aria-label="Smarter Dog home (opens in a new tab)">
            <img src="/logo.png" alt="Smarter Dog Grooming" />
          </a>
          <div className="portal-topnav-links">
            <a className="portal-topnav-link--hide-sm" href="https://smarterdog.co.uk/#services" target="_blank" rel="noopener noreferrer">Services</a>
            <a className="portal-topnav-link--hide-sm" href="https://smarterdog.co.uk/#faq" target="_blank" rel="noopener noreferrer">FAQ</a>
            <a className="portal-topnav-link--hide-sm" href="https://smarterdog.co.uk/houndsly" target="_blank" rel="noopener noreferrer">Houndsly</a>
            <button type="button" onClick={requestSignOut}>Sign out</button>
          </div>
        </div>
      </nav>

      {/* ===== GREETING BAND ===== */}
      <header className="portal-header">
        <div className="portal-header-inner">
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
            <p className="portal-tagline">Smarter grooming for a Smarter Dog.</p>
            {statusLine && (
              <p className={`portal-status-line portal-status-line--${statusLine.tone}`}>
                {statusLine.text}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main id="main-content" className="portal-main">
        <div className="portal-content">

          {loadError && (
            <div role="alert" className="portal-section--full portal-alert portal-alert--error">
              {loadError}
            </div>
          )}

          {/* Booking card — single source of truth for the next-action block. */}
          <BookingCard
            upcomingBookings={upcomingBookings}
            dogs={dogs}
            onBook={handleBook}
            onBookingChanged={refreshBookings}
          />

          {/* Three-column row: My details | My dogs | Trusted humans */}
          <div className="portal-section--full portal-trio">
            <MyDetailsCard
              editing={editing}
              setEditing={setEditing}
              saving={saving}
              saveError={saveError}
              details={details}
              setDetails={setDetails}
              humanRecord={humanRecord}
              onSave={handleSave}
              onCancel={handleCancel}
            />

            <DogsSection
              dogs={dogs}
              lastGroomByDog={lastGroomByDog}
              humanId={humanRecord?.id}
              onBook={handleBook}
              onDogUpdated={(row) =>
                setDogs(prev => prev.map(d => (d.id === row.id ? { ...d, ...row } : d)))
              }
              onDogAdded={(row) =>
                setDogs(prev => (prev.some(d => d.id === row.id) ? prev : [...prev, row]))
              }
            />

            <TrustedHumansSection
              dogName={dogs[0]?.name || "your pup"}
              trustedHumans={trustedHumans}
              onAdded={(row) =>
                setTrustedHumans(prev =>
                  prev.some(t => t.id === row.id) ? prev : [...prev, row]
                )
              }
            />
          </div>

          {/* Past appointments — collapsed by default. */}
          <div className="portal-section--full">
            <AppointmentsSection
              pastBookings={pastBookings}
              dogs={dogs}
              pastExpanded={pastExpanded}
              setPastExpanded={setPastExpanded}
              hasMorePast={hasMorePast}
              loadingMore={loadingMore}
              onLoadMore={handleLoadMore}
              onSubscribe={upcomingBookings.length > 0 ? () => setShowCalendarModal(true) : null}
            />
          </div>

        </div>

        {/* ===== FOOTER ===== */}
        <footer className="portal-footer">
          <div className="portal-footer-inner">
            <div className="portal-footer-row">
              <p className="portal-footer-tagline">Smarter grooming, Smarter Dog.</p>
              <a className="portal-footer-phone" href="tel:07507731487" aria-label="Call Smarter Dog on 07507 731487">
                <Phone size={16} aria-hidden="true" />
                07507 731487
              </a>
            </div>
            <div className="portal-footer-row portal-footer-row--right">
              <span className="portal-footer-meta">
                <Clock size={14} aria-hidden="true" />
                {hoursLabel}
              </span>
              <div className="portal-footer-links">
                <a href="https://smarterdog.co.uk/#services" target="_blank" rel="noopener noreferrer">Services</a>
                <span className="portal-footer-links-sep" aria-hidden="true">·</span>
                <a href="https://smarterdog.co.uk/#faq" target="_blank" rel="noopener noreferrer">FAQ</a>
                <span className="portal-footer-links-sep" aria-hidden="true">·</span>
                <a href="https://smarterdog.co.uk/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
                <span className="portal-footer-links-sep" aria-hidden="true">·</span>
                <a href="https://smarterdog.co.uk/terms" target="_blank" rel="noopener noreferrer">Terms</a>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Sticky mobile CTA — kept because the header CTA is gone and the
          page CTA scrolls off-screen on mobile. */}
      <div className="portal-sticky-cta">
        <button className="portal-btn portal-btn--cta" onClick={handleBook}>
          <PawPrint size={18} aria-hidden="true" />
          Book a groom
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
