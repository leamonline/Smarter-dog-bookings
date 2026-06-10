import { SERVICES } from "../../../constants/index";
import { AVAILABLE_ADDONS, getAddonPrice } from "../../../constants/salon";
import {
  getNumericPrice,
  getServicePriceLabel,
} from "../../../engine/bookingRules";
import {
  DetailRow,
  LogisticsLabel,
  FinanceLabel,
  SectionCard,
  MODAL_INPUT_CLS,
} from "./shared.jsx";

/**
 * Card 2 of the booking detail surface: services, add-ons and the price
 * breakdown. Edit mode exposes the service select, add-on checkboxes and
 * the custom base-price input; read mode itemises the charge, any
 * deposit/full payment already taken, and the resulting amount due.
 * All figures come from the pricing object computed by the orchestrator
 * (computeBookingPricing) so this card can never disagree with the header.
 */
export function ServicesAddonsCard({
  booking,
  isEditing,
  editData,
  setEditData,
  setSaveError,
  dogData,
  allowedServices,
  sizeTheme,
  pricing,
  activeAddons,
  activePayment,
  activeDepositAmount,
}) {
  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);
  const activePrice = pricing.basePrice;
  const amountDue = pricing.amountDue;

  if (isEditing) {
    return (
      <SectionCard title="Services & Add-ons">
        <DetailRow
          label={<LogisticsLabel text="Service" />}
          value={serviceObj?.name || currentService}
          editNode={
            <select value={editData.service} onChange={(e) => { setEditData((prev) => ({ ...prev, service: e.target.value, customPrice: dogData?.customPrice !== undefined ? dogData.customPrice : getNumericPrice(getServicePriceLabel(e.target.value, booking.size)) })); setSaveError(""); }} className={MODAL_INPUT_CLS}>
              {allowedServices.map((service) => (<option key={service.id} value={service.id}>{service.name}</option>))}
            </select>
          }
          isEditing={isEditing}
        />
        <div className="py-2.5 border-b border-slate-100">
          <div className="mb-2"><LogisticsLabel text="Add-ons" /></div>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_ADDONS.map((addon) => (
              <label key={addon} className="flex items-center gap-1.5 text-[13px] cursor-pointer font-medium">
                <input type="checkbox" className="w-[18px] h-[18px] cursor-pointer" style={{ accentColor: sizeTheme.primary }} checked={editData.addons.includes(addon)} onChange={(e) => { if (e.target.checked) { setEditData((prev) => ({ ...prev, addons: [...prev.addons, addon] })); } else { setEditData((prev) => ({ ...prev, addons: prev.addons.filter((a) => a !== addon) })); } }} />{" "}{addon}
              </label>
            ))}
          </div>
        </div>
        <DetailRow
          label={<FinanceLabel text="Base Price" />}
          value={
            <div className="flex items-center gap-1.5">
              <span className="font-semibold">{"£"}</span>
              <input type="number" value={editData.customPrice} onChange={(e) => setEditData((prev) => ({ ...prev, customPrice: Number(e.target.value) }))} className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border" />
            </div>
          }
          isEditing={isEditing}
        />
      </SectionCard>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-[1.5px] border-slate-200 mb-3 px-4 py-1">
      <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
        <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-slate-500">
          {serviceObj?.name || currentService}
        </span>
        <span className="text-[14px] text-slate-700 tabular-nums">{"£"}{activePrice}</span>
      </div>
      {activeAddons.map((addon) => (
        <div key={addon} className="flex justify-between items-center py-2.5 border-b border-slate-100">
          <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-slate-500">
            {addon} <span className="text-slate-400 font-semibold normal-case tracking-normal">{"— Add-on"}</span>
          </span>
          <span className="text-[14px] text-slate-700 tabular-nums">
            {getAddonPrice(addon) > 0 ? `£${getAddonPrice(addon)}` : <span className="text-slate-400 font-medium italic">Included</span>}
          </span>
        </div>
      ))}
      {activePayment === "Deposit Paid" && (
        <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
          <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-slate-500">Deposit Paid</span>
          <span className="text-[14px] text-slate-500 tabular-nums">{"−£"}{Number(activeDepositAmount || 0)}</span>
        </div>
      )}
      {activePayment === "Paid in Full" && (
        <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
          <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-slate-500">Paid in Full</span>
          <span className="text-[14px] text-slate-500 tabular-nums">{"−£"}{pricing.subtotal}</span>
        </div>
      )}
      <div className="flex justify-between items-center pt-3 pb-2.5">
        <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-slate-500">
          {activePayment === "Paid in Full" ? "Paid" : "Total Due"}
        </span>
        <span className="text-[20px] font-extrabold leading-none text-brand-purple tabular-nums">
          {"£"}{Math.max(0, amountDue)}
        </span>
      </div>
    </div>
  );
}
