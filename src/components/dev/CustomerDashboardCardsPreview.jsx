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
import "../../customer-portal.css";

function Frame({ title, children, wide }) {
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">{title}</h3>
      <div
        style={{
          background: "var(--sd-paper)",
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
      <p className="text-[13px] text-slate-500 mb-6">
        Resize wide to check the BookingCard empty-state CTA doesn&apos;t leave
        dead space next to the button, and that the TrustedHumans empty
        state centres in the card rather than sitting at the top with a gap.
      </p>

      <Frame title="BookingCard — empty state, wide (was: 2/3 dead space next to the CTA)" wide>
        <BookingCard
          upcomingBookings={[]}
          dogs={[{ id: "dog-1", name: "Alfie" }]}
          onBook={() => {}}
          onBookingChanged={async () => {}}
        />
      </Frame>

      <Frame title="TrustedHumansSection — empty, next to a taller sibling" wide>
        <div className="portal-trio" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "stretch" }}>
          <div className="portal-card portal-card--sky" style={{ height: 260 }}>
            <div className="portal-card-header">
              <h2 className="portal-card-title">Tall sibling card</h2>
            </div>
            <p style={{ fontSize: 13, color: "var(--sd-navy-soft)" }}>
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
    </div>
  );
}
