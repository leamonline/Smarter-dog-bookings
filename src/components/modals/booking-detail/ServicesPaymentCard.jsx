import { Scissors } from "lucide-react";
import { PanelShell } from "../shell/index.js";
import { PaymentStateSection } from "./PaymentStateSection.jsx";
import { ServicesAddonsCard } from "./ServicesAddonsCard.jsx";

export function ServicesPaymentCard({
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
  onUpdate,
  currentDateStr,
}) {
  return (
    <PanelShell
      eyebrow="Services & payment"
      icon={Scissors}
      accent={pricing.isPaidInFull ? "emerald" : "teal"}
      className="mb-3"
    >
      <ServicesAddonsCard
        booking={booking}
        isEditing={isEditing}
        editData={editData}
        setEditData={setEditData}
        setSaveError={setSaveError}
        dogData={dogData}
        allowedServices={allowedServices}
        sizeTheme={sizeTheme}
        pricing={pricing}
        activeAddons={activeAddons}
        embedded
      />
      {!isEditing && (
        <div className="flex items-center justify-between py-3 border-t border-slate-200">
          <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Total
          </span>
          <span className="text-[20px] font-extrabold text-brand-purple tabular-nums">
            £{pricing.subtotal}
          </span>
        </div>
      )}
      <PaymentStateSection
        booking={booking}
        isEditing={isEditing}
        editData={editData}
        setEditData={setEditData}
        pricing={pricing}
        onUpdate={onUpdate}
        currentDateStr={currentDateStr}
      />
    </PanelShell>
  );
}
