import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCustomerDashboardData } from "../../supabase/hooks/useCustomerDashboardData";
import { useDraftPersistence } from "../../hooks/useDraftPersistence";
import { toDateStr } from "../../supabase/transforms";
import { MyDetailsCard } from "./MyDetailsCard.jsx";
import { DogsSection } from "./DogsSection.jsx";
import { TrustedHumansSection } from "./TrustedHumansSection.jsx";
import { AppointmentsSection } from "./AppointmentsSection.jsx";
import { BookingCard } from "./BookingCard.jsx";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { friendlySaveError } from "../../utils/friendlyError";
import { PawPrint, MessageCircle, Mail } from "lucide-react";
import { BOOKING_STATUS } from "../../constants/salon";
import {
  SALON_PHONE_DISPLAY,
  SALON_WHATSAPP_URL,
  SALON_EMAIL,
  SALON_EMAIL_HREF,
} from "../../constants/salonContact.ts";
import {
  SALON_PRIVACY_URL,
  SALON_TERMS_URL,
} from "../../constants/salonPolicies.ts";

const OVERDUE_DAYS = 42; // 6 weeks; the 'due for another?' threshold.

export function CustomerDashboard({ humanRecord, onSignOut }) {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    dogs,
    bookings,
    olderBookings,
    trustedHumans,
    loading,
    loadError,
    hasMorePast,
    loadingMore,
    loadMore,
    refreshBookings,
    saveContactDetails,
    updateDog,
    addDog,
  } = useCustomerDashboardData(humanRecord);
  const [editing, setEditing] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
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

  // Persist an in-progress edit of "My details" so navigating away mid-edit
  // doesn't discard it. The card shows live server data until the customer
  // hits Edit, so we hydrate from the draft on entering edit mode (once),
  // save while editing, and clear on save/cancel.
  const detailsDraftKey = `sdb:draft:mydetails:${humanRecord?.id ?? "anon"}`;
  const {
    restored: restoredDetails,
    save: saveDetailsDraft,
    clear: clearDetailsDraft,
  } = useDraftPersistence(detailsDraftKey);
  const draftAppliedRef = useRef(false);

  useEffect(() => {
    if (editing) saveDetailsDraft(details);
  }, [editing, details, saveDetailsDraft]);

  // Wrap setEditing so entering edit mode hydrates any saved draft exactly
  // once per mount (re-applying it after a save would clobber fresh data).
  const handleSetEditing = useCallback(
    (next) => {
      if (next === true && !draftAppliedRef.current && restoredDetails) {
        setDetails(restoredDetails);
        draftAppliedRef.current = true;
      }
      setEditing(next);
    },
    [restoredDetails],
  );

  const humanName = `${humanRecord?.name || ""} ${humanRecord?.surname || ""}`.trim();

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    const { error: err, saved } = await saveContactDetails({
      name: details.name,
      surname: details.surname,
      address: details.address,
      postcode: humanRecord?.postcode ?? null,
      email: details.email,
      whatsapp: details.whatsapp,
      fb: details.fb,
      insta: details.insta,
      tiktok: details.tiktok,
    });
    setSaving(false);
    if (err) {
      // Inline saveError is the primary feedback channel — it persists
      // alongside the still-open form so the user can read and react.
      // No error toast to avoid duplicating the same signal. Never splice the
      // raw DB/RLS message into the copy.
      setSaveError(
        friendlySaveError(err, "We couldn't save your changes. Try again, or refresh if it keeps failing."),
      );
      return;
    }
    if (!saved) return;
    clearDetailsDraft();
    setEditing(false);
    toast.show("Details saved", "success");
  }, [humanRecord, details, toast, clearDetailsDraft, saveContactDetails]);

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
    clearDetailsDraft();
    setEditing(false);
  }, [humanRecord, clearDetailsDraft]);

  const today = toDateStr(new Date());

  const upcomingBookings = useMemo(() =>
    bookings.filter(b => b.bookingDate >= today && b.status !== BOOKING_STATUS.CANCELLED)
      .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate) || a.slot.localeCompare(b.slot)),
    [bookings, today]
  );

  const pastBookings = useMemo(() =>
    [...bookings.filter(b => b.bookingDate < today), ...olderBookings]
      .filter(b => b.status !== BOOKING_STATUS.CANCELLED)
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || b.slot.localeCompare(a.slot)),
    [bookings, olderBookings, today]
  );

  // Status line — shown beneath the welcome tagline ONLY when there's no
  // upcoming booking, so it doesn't repeat the BookingCard (the single
  // source of truth for the next groom). Two flavours:
  //   • last groom ≥ 6 weeks → amber ("Alfie's last groom was X — due for another?")
  //   • last groom < 6 weeks → mute  ("Alfie's last groom was X weeks ago")
  const statusLine = useMemo(() => {
    if (upcomingBookings.length > 0) return null;
    if (pastBookings.length === 0) return null;
    const last = pastBookings[0];
    const lastDog = last.dog?.name || dogs[0]?.name || "your pup";
    const lastDate = new Date(last.bookingDate + "T00:00:00");
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
      if (!b.dogId || map[b.dogId]) continue;
      map[b.dogId] = b.bookingDate;
    }
    return map;
  }, [pastBookings]);

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
              {/* Don't surface the raw fetch/RLS error; a dropped connection gets its own line. */}
              {friendlySaveError(loadError, "We couldn't load your details. Please refresh, or message us if it keeps happening.")}
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
              setEditing={handleSetEditing}
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
              onDogUpdated={updateDog}
              onDogAdded={addDog}
            />

            <TrustedHumansSection trustedHumans={trustedHumans} />
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
              onLoadMore={loadMore}
              onSubscribe={upcomingBookings.length > 0 ? () => setShowCalendarModal(true) : null}
            />
          </div>

        </div>

        {/* ===== FOOTER ===== */}
        <footer className="portal-footer">
          <div className="portal-footer-inner">
            <div className="portal-footer-row">
              <p className="portal-footer-tagline">Smarter grooming, Smarter Dog.</p>
              <span className="portal-footer-contact">
                <a
                  className="portal-footer-phone"
                  href={SALON_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Message Smarter Dog on WhatsApp at ${SALON_PHONE_DISPLAY}`}
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  {SALON_PHONE_DISPLAY}
                </a>
                <a
                  className="portal-footer-phone"
                  href={SALON_EMAIL_HREF}
                  aria-label={`Email Smarter Dog at ${SALON_EMAIL}`}
                >
                  <Mail size={16} aria-hidden="true" />
                  {SALON_EMAIL}
                </a>
              </span>
            </div>
            <div className="portal-footer-row portal-footer-row--right">
              <div className="portal-footer-links">
                <a href="https://smarterdog.co.uk/#services" target="_blank" rel="noopener noreferrer">Services</a>
                <span className="portal-footer-links-sep" aria-hidden="true">·</span>
                <a href="https://smarterdog.co.uk/#faq" target="_blank" rel="noopener noreferrer">FAQ</a>
                <span className="portal-footer-links-sep" aria-hidden="true">·</span>
                <a href={SALON_PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy</a>
                <span className="portal-footer-links-sep" aria-hidden="true">·</span>
                <a href={SALON_TERMS_URL} target="_blank" rel="noopener noreferrer">Terms</a>
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
