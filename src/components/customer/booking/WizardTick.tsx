import { Check } from "lucide-react";

/**
 * On-brand tick box for selectable booking options (dog / service / slot).
 * Shows an empty rounded box when unselected and a filled navy box with a
 * white check when selected, so the multi/single-select state reads at a
 * glance and stays consistent across every step of the wizard.
 */
export function WizardTick({ selected }: { selected: boolean }) {
  return (
    <span className="wizard-tick" data-checked={selected} aria-hidden="true">
      {selected && <Check size={14} strokeWidth={3.5} />}
    </span>
  );
}
