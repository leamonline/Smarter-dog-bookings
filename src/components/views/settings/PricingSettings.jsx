import { SERVICES, DOG_SIZES } from "../../../constants/index";
import { penceToPounds, pricePenceFromTableValue } from "../../../utils/money";
import { Card, CardHead, CardBody, ReadOnlyNotice, SECTION_LABEL_CLS } from "./shared.jsx";

export function PricingSettings({ config }) {
  const currentServices = config?.services || SERVICES;
  const currentPricing = config?.pricing || {};

  const priceInputCls = "w-full py-2 px-2 pl-10 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit text-slate-800 outline-none transition-colors focus:border-brand-teal disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";

  return (
    <Card id="settings-pricing">
      <CardHead
        variant="yellow"
        title="Services & Pricing"
        desc='Base prices per size — shown as "from" on the booking portal'
      />
      <CardBody>
        <ReadOnlyNotice>
          Prices are read-only for now. Changes need a coordinated release; ask the owner and allow half a working day. Adding or removing a service uses that same process.
        </ReadOnlyNotice>
        {/* Header + rows scroll together on narrow screens so the price
            columns stay aligned and legible instead of crushing the layout. */}
        <div className="overflow-x-auto">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_90px_90px_90px_32px] gap-2 pb-2 border-b-2 border-slate-200 mb-1 min-w-[440px]">
          <span className={`${SECTION_LABEL_CLS} !mb-0`}>Service</span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-small mr-0.5 align-middle" />
            Small
          </span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-medium mr-0.5 align-middle" />
            Medium
          </span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-large mr-0.5 align-middle" />
            Large
          </span>
          <span />
        </div>

        {/* Service rows */}
        {currentServices.map((s, idx) => (
          <div
            key={s.id}
            className={`grid grid-cols-[1fr_90px_90px_90px_32px] gap-2 items-center py-2.5 min-w-[440px] ${
              idx < currentServices.length - 1 ? "border-b border-slate-200" : ""
            }`}
          >
            <div className="text-sm font-semibold text-slate-800">
              {s.name}
            </div>
            {DOG_SIZES.map((size) => {
              // Values are integer pence (legacy "£42" strings tolerated
              // until the pence migration runs); the input shows pounds.
              const pence = pricePenceFromTableValue(currentPricing[s.id]?.[size]);
              const val = pence != null ? String(penceToPounds(pence)) : "";
              return (
                <div key={size} className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 font-semibold pointer-events-none">
                    from £
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    disabled
                    value={val}
                    readOnly
                    className={priceInputCls}
                  />
                </div>
              );
            })}
            <button
              type="button"
              disabled
              aria-label={`Delete ${s.name} service`}
              className="tap-target w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500 transition-all cursor-not-allowed opacity-60"
            >
              {"\u2715"}
            </button>
          </div>
        ))}
        </div>

        {/* Add service */}
        <div className="flex gap-2 mt-3 items-center">
          <input
            type="text"
            disabled
            value=""
            readOnly
            placeholder="Service name"
            className="flex-1 py-2 px-3 rounded-control border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
          />
          <button
            disabled
            className="border-[1.5px] border-dashed border-slate-200 rounded-control bg-transparent px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer font-inherit transition-all whitespace-nowrap hover:border-brand-teal hover:text-brand-teal disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
          >
            + Add service
          </button>
        </div>

      </CardBody>
    </Card>
  );
}
