import { useId } from "react";
import { SERVICES } from "../../../constants/index";
import { FROM_PRICED_SERVICES } from "../../../constants/salon";
import { computeBookingPricing } from "../../../engine/bookingRules";
import { confirmationChoiceAvailable, confirmationServiceLabel, preferredServiceAvailable } from "../../../engine/bookingConfirmation";
import { formatGBP, poundsToPence } from "../../../utils/money";
import { titleCase } from "./helpers.js";
import { Button, Field, Select } from "../../ui";

// A preview of the current draft, not a quote or a claim of message delivery.
// Keep channel eligibility on the server: contact data here can be incomplete
// and recipients may include trusted humans with different available channels.
export function BookingConfirmationSection({
  dogEntries,
  selectedDateDisplay,
  selectedSlotLabel,
  recurringWeeks,
  confirmationChannel,
  isSaving,
  onChannelChange,
  contactState,
  configPricing,
}) {
  const id = useId();
  const allSizesKnown = dogEntries.every(({ dog, chosenSize }) => dog.size || chosenSize);
  const guideTotal = dogEntries.reduce((total, { dog, chosenSize, service, addons }) =>
    total + computeBookingPricing({ service, size: dog.size || chosenSize, addons, customPrice: dog.customPrice, configPricing }).subtotal, 0);
  const hasAgreedPrice = ({ dog }) => Number(dog.customPrice) > 0;
  const allAgreed = dogEntries.every(hasAgreedPrice);
  const fromPriced = dogEntries.some((entry) => !hasAgreedPrice(entry) && FROM_PRICED_SERVICES.has(entry.service));
  const contact = contactState?.contact;
  const preferredLabel = contactState?.loading ? "loading…" : contactState?.error ? "unavailable" : confirmationServiceLabel(contact?.preferredService);
  const preferenceBlocked = contact && !preferredServiceAvailable(contact);
  const explicitChannel = confirmationChannel === "whatsapp" || confirmationChannel === "sms" || confirmationChannel === "email";
  const explicitBlocked = explicitChannel && contact && !confirmationChoiceAvailable(contact, confirmationChannel);
  const methodHelp = confirmationChannel === "auto"
    ? contactState?.loading ? "Loading the customer's saved preference."
      : contactState?.error ? "Couldn't load the preferred service. Choose a service or try again."
        : preferenceBlocked ? "The preferred service is unavailable in this customer's contact settings. Choose another service or don't send."
          : contact?.preferredService ? "Uses the customer's saved preference. Contact settings are checked again when sending."
            : "No preferred service is saved. Choose a service, or use the first available method: WhatsApp, SMS, then email."
    : confirmationChannel === "none"
      ? "Creates the booking without sending a confirmation."
      : contactState?.loading
        ? "Checking whether this customer can be contacted on this service."
        : explicitBlocked
          ? "This service is unavailable in this customer's contact settings. Choose another service or don't send."
          : "Uses this method only if the recipient can be contacted on it. Contact preferences still apply.";

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-brand-paper-line bg-white p-3.5">
      <h2 id={`${id}-title`} className="m-0 text-sm font-extrabold text-brand-ink">Ready to book</h2>
      <p className="mt-1 mb-2 text-sm font-semibold text-slate-700">
        {selectedDateDisplay} · {selectedSlotLabel}
      </p>
      <ul className="m-0 p-0 list-none space-y-1 text-sm text-slate-700">
        {dogEntries.map(({ dog, service, addons }) => (
          <li key={dog.id}>
            <span className="font-semibold">{titleCase(dog.name)}</span>
            {" · "}{SERVICES.find(({ id: serviceId }) => serviceId === service)?.name || service}
            {addons?.length > 0 && <span className="block text-xs text-slate-600">{addons.join(", ")}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 mb-0 text-sm font-semibold text-brand-ink">
        {allSizesKnown
          ? `${allAgreed ? "Agreed total" : "Guide total"}${recurringWeeks > 0 ? " per appointment" : ""}: ${formatGBP(poundsToPence(guideTotal))}${fromPriced ? "+" : ""}`
          : "Choose each dog's size to see guide prices."}
      </p>
      {allSizesKnown && fromPriced && <p className="mt-1 mb-0 text-xs text-slate-600">Final price may vary with coat condition.</p>}
      {recurringWeeks > 0 && <p className="mt-1 mb-0 text-xs text-slate-600">Repeats every {recurringWeeks} weeks; full dates are skipped.</p>}
      <Field label="Customer confirmation" className="mt-3 pt-3 border-t border-brand-paper-line">
        {confirmationChannel === "auto" && <p className="mt-0 mb-2 text-sm font-semibold text-brand-ink">Send via preferred service - [{preferredLabel}]</p>}
        <Select
          value={confirmationChannel}
          disabled={isSaving}
          onChange={(event) => onChannelChange(event.target.value)}
          aria-describedby={`${id}-help`}
        >
          <option value="auto">Preferred service</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="none">Don't send a confirmation</option>
        </Select>
        <p id={`${id}-help`} className="mt-2 mb-0 text-xs leading-relaxed text-slate-600">{methodHelp}</p>
        {contactState?.error && <Button variant="link" type="button" onClick={contactState.refresh}>Try loading preference again</Button>}
      </Field>
    </section>
  );
}
