import { LARGE_DOG_SLOTS } from "../../../constants/salon";
import { Card, CardHead, CardBody, SECTION_LABEL_CLS } from "./shared.jsx";

// Read-only by design (AUDIT-1). The 2-2-1 rules are hardcoded in three
// copies that must change together — the frontend engine (LARGE_DOG_SLOTS,
// rendered here), the Deno mirror in _shared/salonConstants.ts, and the
// Postgres trigger's SQL helpers. The old editable card wrote
// salon_config.large_dog_slots / enforce_capacity, which no enforcement
// path reads; the real kill switch is salon_config.enforce_server_capacity
// (SQL-only, deliberately not a UI toggle). See docs/capacity-engine.md.

function slotRuleText(rule) {
  if (rule.seats === 2) return "Takes both seats — no sharing";
  return rule.canShare
    ? "1 seat — shares with small & medium dogs"
    : "1 seat";
}

export function CapacitySettings() {
  return (
    <Card id="settings-capacity">
      <CardHead
        variant="coral"
        title="Capacity Engine"
        desc="The 2-2-1 rule is a seat-capacity pattern across neighbouring slots"
      />
      <CardBody>
        <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12px] text-slate-700 leading-relaxed">
          <p className="m-0 mb-1.5 font-semibold text-slate-800">
            What the 2-2-1 rule means
          </p>
          <p className="m-0 mb-1.5">
            Each time slot normally has two seats. The 2-2-1 rule lowers a
            slot to one seat when an adjacent pair of slots is already using
            two seats each. It is a seat-capacity pattern, not quotas by dog
            size.
          </p>
          <p className="m-0 mb-1.5 text-slate-600">
            <em>Worked example:</em> if 09:00 and 09:30 are each using two
            seats, 10:00 is limited to one seat. A one-seat booking can use it
            if its own rules allow; a two-seat full-takeover booking cannot.
          </p>
          <p className="m-0 text-slate-600">
            Full details + the underlying check function are in{" "}
            <a
              href="https://github.com/leamonline/Smarter-dog-bookings/blob/main/docs/capacity-engine.md"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-teal underline"
            >
              docs/capacity-engine.md
            </a>
            .
          </p>
        </div>

        <div className={SECTION_LABEL_CLS}>Large Dog Approved Slots</div>
        <div className="text-xs text-slate-500 mb-2.5">
          The times a large dog can be booked, and what each one allows.
        </div>
        <div className="flex flex-col">
          {Object.entries(LARGE_DOG_SLOTS)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([time, rule]) => (
              <div
                key={time}
                className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-b-0"
              >
                <span className="inline-flex items-center bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-bold tabular-nums">
                  {time}
                </span>
                <span className="text-xs text-slate-600">{slotRuleText(rule)}</span>
                {rule.conditional && (
                  <span className="inline-flex items-center bg-slate-100 text-slate-500 px-2 py-[3px] rounded-lg text-[11px] font-semibold">
                    conditional
                  </span>
                )}
              </div>
            ))}
        </div>
        <p className="mt-2.5 mb-0 text-xs text-slate-500">
          A large dog at 12:00 also closes the 13:00 slot early, and
          back-to-back full-takeover slots are only allowed at 12:30 + 13:00.
        </p>

        <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12px] text-slate-600 leading-relaxed">
          These rules are fixed in the app and the database together, so they
          can't drift out of sync or get switched off by accident. Changing
          them is a code change — all the copies are updated at once (the doc
          above explains where they live).
        </div>
      </CardBody>
    </Card>
  );
}
