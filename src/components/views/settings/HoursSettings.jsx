import { Card, CardHead, CardBody, ReadOnlyNotice, SECTION_LABEL_CLS, INPUT_CLS } from "./shared.jsx";
import { DEFAULT_BUSINESS_HOURS } from "../../../constants/index";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function HoursSettings({ config }) {
  const hours = config?.businessHours || DEFAULT_BUSINESS_HOURS;
  const closures = config?.closures || [];

  return (
    <Card id="settings-hours">
      <CardHead variant="blue" title="Opening Hours & Closures" desc="Weekly schedule and holiday dates" />
      <CardBody>
        <ReadOnlyNotice>
          These weekly hours are saved reference only; they do not control live availability. For a one-off change, use Bookings, select the date, then choose Open this day or Close this day. Permanent weekly changes currently need an approved deployment.
        </ReadOnlyNotice>
        <div className={SECTION_LABEL_CLS}>Weekly Hours</div>
        <div className="flex flex-col gap-1 overflow-x-auto">
          {DAYS.map((day) => {
            const d = hours[day] || DEFAULT_BUSINESS_HOURS[day];
            return (
              <div key={day}>
                <div className="grid grid-cols-[80px_1fr_1fr_32px] gap-2 items-center py-1 min-w-[320px]">
                  <span className={`text-[13px] font-bold ${d.closed ? "text-brand-red" : "text-slate-800"}`}>
                    {day}
                  </span>
                  {d.closed ? (
                    <div className="col-span-2 text-center text-[11px] font-bold text-brand-red bg-red-100 py-2 rounded-lg">
                      CLOSED
                    </div>
                  ) : (
                    <>
                      <input
                        type="time"
                        disabled
                        value={d.open}
                        readOnly
                        className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                      />
                      <input
                        type="time"
                        disabled
                        value={d.close}
                        readOnly
                        className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    disabled
                    aria-label={`${d.closed ? "Open" : "Close"} ${day} reference hours`}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[13px] transition-all cursor-not-allowed opacity-60 ${
                      d.closed
                        ? "border-brand-red bg-red-100 text-brand-red"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-red-100 hover:text-brand-red hover:border-brand-red"
                    }`}
                  >
                    {"\u2715"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Closures */}
        <div className="border-t border-slate-200 mt-3.5 pt-3.5">
          <div className={SECTION_LABEL_CLS}>Reference closures</div>
          <div className="flex flex-wrap gap-1.5">
            {closures.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-semibold"
              >
                {c.date}{c.label ? ` \u2014 ${c.label}` : ""}
                <button
                  type="button"
                  disabled
                  aria-label={`Remove closure ${c.date}`}
                  className="cursor-not-allowed opacity-60 text-sm bg-transparent border-none p-0 font-inherit"
                >
                  {"\u00D7"}
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2.5 items-center flex-wrap">
            <input
              type="date"
              disabled
              value=""
              readOnly
              className={`${INPUT_CLS} !w-40 !py-1.5 !px-2.5`}
            />
            <input
              type="text"
              disabled
              value=""
              readOnly
              aria-label="Closure label (optional)"
              placeholder="Label (optional)"
              className={`${INPUT_CLS} !w-[180px] !py-1.5 !px-2.5`}
            />
            <button
              disabled
              className="border-[1.5px] border-dashed border-slate-200 rounded-control bg-transparent px-3.5 py-1.5 text-xs font-bold text-slate-500 cursor-pointer font-inherit transition-all hover:border-brand-teal hover:text-brand-teal disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
            >
              + Add
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
