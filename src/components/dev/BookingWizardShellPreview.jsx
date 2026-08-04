// ============================================================
// src/components/dev/BookingWizardShellPreview.jsx
//
// Dev-only harness for the booking wizard's responsive shell (the
// .booking-wizard-inner two-column grid + BookingSummarySidebar). The real
// step components (DogSelection, DateSelection, ...) fetch live data from
// Supabase internally, so this harness swaps in a static placeholder for
// the step content and mounts the REAL BookingSummarySidebar with mocked
// props at a few fill states, to check the shell/grid/breakpoints without
// needing an authenticated customer session.
//
// Mounted on /dev/booking-wizard-shell-preview, gated by
// `import.meta.env.DEV` in the router so it never bundles into production.
// ============================================================

import { PawPrint } from "lucide-react";
import { BookingSummarySidebar } from "../customer/booking/BookingSummarySidebar";
import { DateSelection } from "../customer/booking/DateSelection";
import { ScribbleUnderline } from "../ui/ScribbleUnderline.jsx";
import "../customer/booking/booking-wizard.css";

function SuccessScreenMock() {
  // Static mock of the "All booked in!" screen — its real markup lives
  // inline in BookingWizard's booked/waitlisted/requestSent branches, not
  // as a separately exported component, so this hand-copies just enough to
  // check the SuccessShell wrapper actually paints the branded gradient
  // background behind it (previously it sat on the plain page background).
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
        Static mock — success screen background (SuccessShell)
      </h3>
      <div className="booking-wizard" style={{ minHeight: 0, borderRadius: 16, overflow: "hidden" }}>
        <div className="booking-success">
          <div className="booking-success-polaroid" aria-hidden="true">
            <div className="booking-success-polaroid-photo">
              <PawPrint size={48} />
            </div>
          </div>
          <h1 className="booking-success-title">
            All booked in!
            <ScribbleUnderline />
          </h1>
          <p className="booking-success-subtitle">
            Can&apos;t wait to see Alfie on <strong>Tuesday, 26 January 2027</strong> at <strong>10:00am</strong>.
          </p>
          <div className="booking-success-actions">
            <button className="wizard-btn wizard-btn--primary">Back to dashboard</button>
          </div>
        </div>
      </div>
    </section>
  );
}

const DOGS = [
  { id: "dog-1", name: "Alfie", breed: "Boston Terrier", size: "small", reportedSize: "small", isPregnant: false },
  { id: "dog-2", name: "Tipi", breed: "Boston Terrier", size: "small", reportedSize: "small", isPregnant: false },
];

const STATES = {
  empty: { selectedDogs: [], services: {}, selectedDate: null, slotAllocation: null },
  partial: {
    selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
    services: { "dog-1": "full-groom" },
    selectedDate: null,
    slotAllocation: null,
  },
  full: {
    selectedDogs: [
      { dogId: "dog-1", name: "Alfie", size: "small" },
      { dogId: "dog-2", name: "Tipi", size: "small" },
    ],
    services: { "dog-1": "full-groom", "dog-2": "bath-and-brush" },
    selectedDate: "2027-01-26",
    slotAllocation: {
      dropOffTime: "10:00",
      groupId: "g1",
      assignments: [
        { dogId: "dog-1", slot: "10:00" },
        { dogId: "dog-2", slot: "10:00" },
      ],
    },
  },
};

function StepPlaceholder({ label }) {
  return (
    <>
      <p className="wizard-helper">Placeholder for the real step component ({label}).</p>
      <div className="wizard-card">
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="wizard-option" style={{ cursor: "default" }}>
              <span>Option {i}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="wizard-actions">
        <button type="button" className="wizard-btn wizard-btn--back" disabled>
          Back
        </button>
        <button type="button" className="wizard-btn wizard-btn--primary" disabled>
          Continue
        </button>
      </div>
    </>
  );
}

function ShellFrame({ title, state }) {
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">{title}</h3>
      <div className="booking-wizard" style={{ minHeight: 0, borderRadius: 16, overflow: "hidden" }}>
        <div className="booking-wizard-inner">
          <div className="booking-wizard-main">
            <div className="booking-wizard-header">
              <button className="booking-wizard-back" disabled>
                ← Cancel
              </button>
              <div className="booking-wizard-title">
                <span className="booking-wizard-kicker">Step 3 of 5</span>
                <h1>
                  Pick a date
                  <ScribbleUnderline />
                </h1>
              </div>
            </div>
            <StepPlaceholder label={title} />
          </div>
          <BookingSummarySidebar dogs={DOGS} {...state} />
        </div>
      </div>
    </section>
  );
}

function CalendarNavFrame() {
  // The REAL DateSelection component — it degrades gracefully with no
  // Supabase client (offline mode), falling back to the default open-day
  // heuristic. Renders here to check that Previous/Next stay pinned at a
  // fixed position as paging changes the grid from 4 to 6 rows.
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
        Real DateSelection — page through it and watch the nav row
      </h3>
      <div className="booking-wizard" style={{ minHeight: 0, borderRadius: 16, overflow: "hidden" }}>
        <div className="booking-wizard-inner">
          <div className="booking-wizard-main">
            <DateSelection
              bookingHorizonDays={180}
              selectedDate={null}
              onSelect={() => {}}
              onNext={() => {}}
              onBack={() => {}}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CalendarStatesMock() {
  // Static mock of the open/closed/fully-booked visual language + legend —
  // offline mode's Supabase client is null, so the real DateSelection can
  // never reach the "complete" branch that shows the legend or a "full" day.
  // This exercises the exact same markup/classes by hand instead.
  return (
    <section className="mb-10">
      <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
        Static mock — open / closed / fully-booked + legend
      </h3>
      <div className="booking-wizard" style={{ minHeight: 0, borderRadius: 16, overflow: "hidden" }}>
        <div className="booking-wizard-inner">
          <div className="booking-wizard-main">
            <div className="wizard-calendar">
              <div className="wizard-calendar-nav">
                <button type="button" className="wizard-calendar-nav-btn tap-target" aria-label="Previous dates">‹</button>
                <h2 className="wizard-calendar-month">August 2026</h2>
                <button type="button" className="wizard-calendar-nav-btn tap-target" aria-label="Next dates">›</button>
              </div>
              <div className="wizard-calendar-legend">
                <span className="wizard-calendar-legend-item">
                  <span className="wizard-calendar-legend-swatch wizard-calendar-legend-swatch--open" aria-hidden="true" />
                  Open
                </span>
                <span className="wizard-calendar-legend-item">
                  <span className="wizard-calendar-legend-swatch wizard-calendar-legend-swatch--full" aria-hidden="true" />
                  Fully booked
                </span>
                <span className="wizard-calendar-legend-item">
                  <span className="wizard-calendar-legend-swatch wizard-calendar-legend-swatch--closed" aria-hidden="true" />
                  Closed
                </span>
              </div>
              <div className="wizard-calendar-grid">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="wizard-day-header">{d}</div>
                ))}
              </div>
              <div className="wizard-calendar-grid mt-1">
                {[
                  { day: 3, state: "open" },
                  { day: 4, state: "full", selected: false },
                  { day: 5, state: "open", selected: true },
                  { day: 6, state: "closed" },
                  { day: 7, state: "closed" },
                  { day: 8, state: "closed" },
                  { day: 9, state: "closed" },
                  { day: 10, state: "open" },
                  { day: 11, state: "full" },
                  { day: 12, state: "open" },
                ].map(({ day, state, selected }) => (
                  <button
                    key={day}
                    type="button"
                    className="wizard-day"
                    data-state={state}
                    aria-pressed={!!selected}
                    disabled={state !== "open"}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BookingWizardShellPreview() {
  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h2 className="text-base font-bold text-slate-800 mb-1">Booking wizard shell preview</h2>
      <p className="text-[13px] text-slate-500 mb-6">
        Resize the viewport across the 640px and 1024px breakpoints. Below 1024px the
        sidebar should disappear and the layout should collapse to a single column;
        above it, the sidebar should appear, stick on scroll, and fill in as state
        changes below.
      </p>
      <SuccessScreenMock />
      <CalendarStatesMock />
      <CalendarNavFrame />
      <ShellFrame title="Empty (step 1, no dogs picked yet)" state={STATES.empty} />
      <ShellFrame title="Partial (dog + service picked, no date/time yet)" state={STATES.partial} />
      <ShellFrame title="Full (everything picked)" state={STATES.full} />
    </div>
  );
}
