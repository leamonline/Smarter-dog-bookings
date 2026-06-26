// ============================================================
// src/components/dev/NewClientPreview.jsx
//
// Dev-only harness for the staff "New client" wizard. Mounts the REAL
// NewClientWizard with mocked write functions + empty calendar data (so the
// weekday default — Mon–Wed open — drives the date/slot pickers with no
// Supabase). Mounted on /dev/new-client, gated by `import.meta.env.DEV` in the
// router so it never bundles into production.
// ============================================================

import { useState } from "react";
import { NewClientWizard } from "../modals/new-client/index.js";

export function NewClientPreview() {
  const [open, setOpen] = useState(true);
  const [failBooking, setFailBooking] = useState(false);
  const [dogN, setDogN] = useState(0);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-base font-bold text-slate-800 mb-1">New client wizard — preview</h2>
      <p className="text-[13px] text-slate-500 mb-4">
        Dev harness with mocked write functions and a weekday-default calendar
        (Mon–Wed open). Tick the box, then reach the booking step, to see the
        in-modal capacity error.
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-full bg-brand-teal text-white text-[13px] font-bold"
        >
          Open wizard
        </button>
        <label className="flex items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={failBooking} onChange={(e) => setFailBooking(e.target.checked)} />
          Force booking failure
        </label>
      </div>

      {open && (
        <NewClientWizard
          onClose={() => setOpen(false)}
          addHuman={async (d) => ({ id: "demo-human-1", ...d })}
          addDog={async (d) => {
            const id = `demo-dog-${dogN + 1}`;
            setDogN((n) => n + 1);
            return { id, _humanId: "demo-human-1", ...d };
          }}
          onAddBookings={async () =>
            failBooking
              ? { ok: false, error: "Slot is full — please pick another time." }
              : { ok: true }
          }
          findHumanByFullName={async () => null}
          onBookAnother={() => {}}
          bookingsByDate={{}}
          dayOpenState={{}}
          daySettings={{}}
        />
      )}
    </div>
  );
}
