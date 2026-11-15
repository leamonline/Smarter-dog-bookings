// ============================================================
// src/components/dev/CustomerDashboardCardsPreview.jsx
//
// Dev-only harness for dashboard card components that take plain props
// (no internal Supabase fetch), so they can be mounted directly with mock
// data — unlike CustomerDashboard itself, which fetches dogs/bookings/
// trusted-humans internally and has no offline/sample-data path.
//
// Mounted on /dev/customer-dashboard-cards-preview, gated by
// `import.meta.env.DEV` in the router so it never bundles into production.
// ============================================================

import { BookingCard } from "../customer/BookingCard.jsx";
import { TrustedHumansSection } from "../customer/TrustedHumansSection.jsx";
import { DepositHoldInstructions } from "../customer/DepositHoldInstructions";
import { MyDetailsCard } from "../customer/MyDetailsCard.jsx";
import { DogsSection } from "../customer/DogsSection.jsx";
import { AppointmentsSection } from "../customer/AppointmentsSection.jsx";

const SAMPLE_DETAILS = {
  name: "Sam",
  surname: "Jones",
  address: "1 Old Road, Hyde, SK14 1AA",
  postcode: "SK14 1AA",
  email: "sam@example.com",
  whatsapp: false,
  fb: "",
  insta: "",
  tiktok: "",
};

const SAMPLE_BOOKING = {
  id: "00000000-0000-4000-8000-000000000001",
  bookingDate: "2026-11-17",
  slot: "09:00",
  service: "full-groom",
  status: "Booked",
  groupId: null,
  visitId: null,
  dogId: "dog-1",
  dog: { name: "Alfie" },
};
import "../../customer-portal.css";

function Frame({ title, children, wide }) {
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">{title}</h3>
      <div
        style={{
          background: "var(--color-brand-paper)",
          padding: 20,
          borderRadius: 16,
          maxWidth: wide ? 1080 : 380,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function CustomerDashboardCardsPreview() {
  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h2 className="text-base font-bold text-slate-800 mb-1">Customer dashboard cards preview</h2>
      <p className="text-body text-slate-500 mb-6">
        Resize wide to check the BookingCard empty-state CTA doesn&apos;t leave
        dead space next to the button, and that the TrustedHumans empty
        state centres in the card rather than sitting at the top with a gap.
      </p>

      <Frame title="BookingCard — empty state, no slot preview (single column)" wide>
        <BookingCard
          upcomingBookings={[]}
          dogs={[{ id: "dog-1", name: "Alfie" }]}
          onBook={() => {}}
          onBookingChanged={async () => {}}
        />
      </Frame>

      <Frame title="BookingCard — empty state with the next free slot" wide>
        <BookingCard
          upcomingBookings={[]}
          dogs={[{ id: "dog-1", name: "Alfie" }]}
          dataLoaded
          nextSlot={{ status: "found", slot: { date: "2026-11-17", dropOffTime: "09:00" } }}
          nextSlotDogName="Alfie"
          onBook={() => {}}
          onBookingChanged={async () => {}}
        />
      </Frame>

      <Frame title="BookingCard — empty state, nothing free in the window" wide>
        <BookingCard
          upcomingBookings={[]}
          dogs={[{ id: "dog-1", name: "Alfie" }]}
          dataLoaded
          nextSlot={{ status: "none" }}
          nextSlotDogName="Alfie"
          onBook={() => {}}
          onBookingChanged={async () => {}}
        />
      </Frame>

      <Frame title="BookingCard — booked, actions in the right-hand column" wide>
        <BookingCard
          upcomingBookings={[SAMPLE_BOOKING]}
          dogs={[{ id: "dog-1", name: "Alfie" }]}
          dataLoaded
          onBook={() => {}}
          onBookingChanged={async () => {}}
        />
      </Frame>

      <Frame title="Dashboard row — white cards, one edit pattern" wide>
        <div className="portal-trio">
          <MyDetailsCard
            editing={false}
            setEditing={() => {}}
            saving={false}
            saveError={null}
            details={{ ...SAMPLE_DETAILS, email: "" }}
            setDetails={() => {}}
            humanRecord={{ phone: "+447700900123" }}
            savedAddress={SAMPLE_DETAILS.address}
            savedPostcode={SAMPLE_DETAILS.postcode}
            onAddressChange={() => {}}
            onSave={() => {}}
            onCancel={() => {}}
          />
          <DogsSection
            dogs={[{ id: "dog-1", name: "Alfie", breed: "Lagotto Romagnolo", size: "medium" }]}
            lastGroomByDog={{ "dog-1": "2026-09-30" }}
            humanId="human-1"
          />
          <TrustedHumansSection
            trustedHumans={[{ id: "th-1", name: "Jo", surname: "Bloggs", relationship: "Partner", phone: "07000 000000" }]}
          />
        </div>
        <div style={{ marginTop: 20 }}>
          <AppointmentsSection
            pastBookings={[]}
            pastExpanded={false}
            setPastExpanded={() => {}}
            hasMorePast={false}
            loadingMore={false}
            onLoadMore={() => {}}
            onSubscribe={null}
          />
        </div>
      </Frame>

      <Frame title="TrustedHumansSection — empty, next to a taller sibling" wide>
        <div className="portal-trio" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "stretch" }}>
          <div className="portal-card" style={{ height: 260 }}>
            <div className="portal-card-header">
              <h2 className="portal-card-title">Tall sibling card</h2>
            </div>
            <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>
              Standing in for My details / My dogs, which are usually taller
              than an empty Trusted humans card.
            </p>
          </div>
          <TrustedHumansSection trustedHumans={[]} />
          <TrustedHumansSection
            trustedHumans={[{ id: "th-1", name: "Jo", surname: "Bloggs", relationship: "Partner", phone: "07000 000000" }]}
          />
        </div>
      </Frame>

      <Frame title="TrustedHumansSection — own read still loading, and failed with retry" wide>
        <div className="portal-trio" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "stretch" }}>
          <TrustedHumansSection trustedHumans={[]} status="loading" />
          <TrustedHumansSection trustedHumans={[]} status="error" onRetry={() => {}} />
        </div>
      </Frame>

      <Frame title="DepositHoldInstructions — copy reference, sort code and account number">
        <div className="wizard-card" style={{ textAlign: "left" }}>
          <DepositHoldInstructions
            amount={10}
            reference="SDG-7K3M"
            dueBy="2099-06-14T09:00:00Z"
            bank={{ accountName: "Smarter Dog", sortCode: "01-02-03", accountNumber: "12345678" }}
            compact
          />
        </div>
      </Frame>

      <Frame title="MyDetailsCard — editing, address through the shared picker">
        <MyDetailsCard
          editing
          setEditing={() => {}}
          saving={false}
          saveError={null}
          details={SAMPLE_DETAILS}
          setDetails={() => {}}
          humanRecord={{ phone: "+447700900123" }}
          savedAddress={SAMPLE_DETAILS.address}
          savedPostcode={SAMPLE_DETAILS.postcode}
          onAddressChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      </Frame>
    </div>
  );
}
