import { useEffect, useState } from "react";
import {
  AVAILABLE_ADDONS,
  PAYMENT_METHODS,
  SERVICES,
  getAddonPrice,
  getAddonsTotal,
} from "../../../constants/salon";
import { computeBookingPricing } from "../../../engine/bookingRules";
import { buildMiniInvoicePatch } from "../../../engine/dailyBrief";
import { ModalShell } from "../../modals/shell/ModalShell.jsx";
import { ConfirmDialog } from "../../modals/ConfirmDialog.jsx";
import { formatMoney } from "./parts.jsx";

const INPUT_CLASS =
  "min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-2 font-[inherit] text-base font-bold tabular-nums text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60 sm:text-sm";

const SAVE_ERROR = "Payment could not be saved. Check your connection and try again.";

export function MiniInvoiceModal({ booking, dog, configPricing, onSave, onClose }) {
  const [initial] = useState(() => {
    const pricing = computeBookingPricing({
      ...booking,
      customPrice: dog?.customPrice ?? null,
      configPricing,
    });
    const retainedDeposit = pricing.isPaidInFull
      ? (booking.depositAmount ?? 0)
      : pricing.depositPaid;
    return {
      basePrice: pricing.basePrice,
      addons: [...(booking.addons || [])],
      depositAmount: retainedDeposit,
      paymentReceived: pricing.isPaidInFull
        ? Math.max(0, pricing.subtotal - Number(retainedDeposit))
        : pricing.amountDue,
      paymentMethod: booking.paymentMethod ?? null,
    };
  });
  const [basePrice, setBasePrice] = useState(initial.basePrice);
  const [addons, setAddons] = useState(initial.addons);
  const [depositAmount, setDepositAmount] = useState(initial.depositAmount);
  const [paymentReceived, setPaymentReceived] = useState(initial.paymentReceived);
  const [paymentMethod, setPaymentMethod] = useState(initial.paymentMethod);
  const [paymentWasEdited, setPaymentWasEdited] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const numericBase = Number(basePrice);
  const subtotal = (Number.isFinite(numericBase) ? numericBase : 0) + getAddonsTotal(addons);
  const numericDeposit = Number(depositAmount);
  const amountDue = Math.max(
    0,
    subtotal - (Number.isFinite(numericDeposit) ? numericDeposit : 0),
  );
  const totals = { subtotal, amountDue };

  useEffect(() => {
    if (!paymentWasEdited) setPaymentReceived(amountDue);
  }, [amountDue, paymentWasEdited]);

  const updateBasePrice = (event) => {
    setBasePrice(event.target.value);
    setDirty(true);
  };

  const updateDepositAmount = (event) => {
    setDepositAmount(event.target.value);
    setDirty(true);
  };

  const updatePaymentReceived = (event) => {
    setPaymentReceived(event.target.value);
    setPaymentWasEdited(true);
    setDirty(true);
  };

  const toggleAddon = (addon) => {
    setAddons((current) =>
      current.includes(addon)
        ? current.filter((item) => item !== addon)
        : [...current, addon],
    );
    setDirty(true);
  };

  const choosePaymentMethod = (methodId) => {
    setPaymentMethod(methodId);
    setDirty(true);
  };

  // In-product confirm (never window.confirm — see docs/modal-standard.md).
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const requestDirtyClose = () => setConfirmingDiscard(true);

  const requestClose = () => {
    if (saving) return;
    if (dirty) {
      requestDirtyClose();
      return;
    }
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const result = buildMiniInvoicePatch({
      booking: { ...booking, customPrice: dog?.customPrice ?? null, configPricing },
      basePrice,
      addons,
      depositAmount,
      paymentReceived,
      paymentMethod,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave(result.patch);
      if (!saved) {
        setError(SAVE_ERROR);
        return;
      }
      onClose();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  };

  const serviceName =
    SERVICES.find((service) => service.id === booking.service)?.name || booking.service;
  const dogName = booking.dogName || dog?.name || "Dog";

  return (
    <ModalShell
      titleId="mini-invoice-title"
      onClose={requestClose}
      dismissOnEscape={!saving}
      widthClass="w-[min(480px,95vw)]"
      maxHeightClass="max-h-[calc(100dvh-1rem)] sm:max-h-[min(92dvh,600px)]"
      bodyClassName="mini-invoice-body p-3 sm:p-4"
      mobilePresentation="sheet"
      rootClassName="mini-invoice-modal"
      header={
        <header className="px-4 pb-2.5 pt-3.5 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Mini invoice
              </p>
              <h2
                id="mini-invoice-title"
                className="truncate font-display text-xl font-bold leading-tight text-brand-purple"
              >
                <span className="sr-only">Invoice ·</span> {dogName}
              </h2>
            </div>
            <p className="max-w-[46%] pt-1 text-right text-xs font-semibold leading-snug text-slate-600">
              {serviceName} · {booking.slot}
            </p>
          </div>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-4 py-2 sm:px-5">
          {error ? (
            <p
              role="alert"
              className="mb-2 rounded-lg bg-brand-coral-light px-2.5 py-1.5 text-xs font-semibold leading-snug text-brand-coral-text"
            >
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="min-h-11 rounded-full border border-slate-200 font-bold disabled:cursor-wait disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="mini-invoice-form"
              disabled={saving}
              className="min-h-11 rounded-full bg-brand-purple font-bold text-white disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save payment"}
            </button>
          </div>
        </div>
      }
    >
      <form id="mini-invoice-form" onSubmit={submit} className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-xs font-bold text-slate-800">
            Base price
            <span className="relative mt-1 block">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-500"
              >
                £
              </span>
              <input
                aria-label="Base groom price"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={basePrice}
                onChange={updateBasePrice}
                disabled={saving}
                className={INPUT_CLASS}
              />
            </span>
          </label>

          <label className="min-w-0 text-xs font-bold text-slate-800">
            Deposit
            <span className="relative mt-1 block">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-500"
              >
                £
              </span>
              <input
                aria-label="Deposit received"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={depositAmount}
                onChange={updateDepositAmount}
                disabled={saving}
                className={INPUT_CLASS}
              />
            </span>
          </label>
        </div>

        <fieldset aria-label="Additional services">
          <legend className="mb-1.5 text-xs font-bold text-slate-800">Add-ons</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {AVAILABLE_ADDONS.map((addon) => {
              const selected = addons.includes(addon);
              const price = getAddonPrice(addon);
              return (
                <button
                  key={addon}
                  type="button"
                  aria-label={price > 0 ? `${addon}, £${price}` : addon}
                  aria-pressed={selected}
                  onClick={() => toggleAddon(addon)}
                  disabled={saving}
                  className={`min-h-11 rounded-lg border px-1.5 py-1 text-center text-[11px] font-bold leading-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60 ${
                    selected
                      ? "border-brand-purple bg-brand-purple text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {addon}
                  {price > 0 ? <span className="ml-1 whitespace-nowrap">+£{price}</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <dl
          aria-label="Invoice summary"
          className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2 border-r border-slate-200 pr-3">
            <dt className="font-semibold text-slate-600">Total</dt>
            <dd className="font-bold tabular-nums text-slate-900">
              {formatMoney(totals.subtotal)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 pl-3">
            <dt className="font-semibold text-slate-600">Balance</dt>
            <dd className="font-bold tabular-nums text-brand-purple">
              {formatMoney(totals.amountDue)}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-[minmax(88px,0.8fr)_minmax(0,2fr)] items-end gap-2">
          <label className="min-w-0 text-xs font-bold text-slate-800">
            Take now
            <span className="relative mt-1 block">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-500"
              >
                £
              </span>
              <input
                aria-label="Payment received"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={paymentReceived}
                onChange={updatePaymentReceived}
                disabled={saving}
                className={INPUT_CLASS}
              />
            </span>
          </label>

          <fieldset aria-label="Payment method" className="min-w-0">
            <legend className="mb-1 text-xs font-bold text-slate-800">Method</legend>
            <div className="grid grid-cols-3 gap-1">
              {PAYMENT_METHODS.map((method) => {
                const selected = paymentMethod === method.id;
                return (
                  <label
                    key={method.id}
                    className={`flex min-h-11 min-w-0 cursor-pointer items-center justify-center rounded-lg border px-1 text-center text-[11px] font-bold leading-tight outline-none transition-colors focus-within:ring-2 focus-within:ring-brand-teal focus-within:ring-offset-1 ${
                      selected
                        ? "border-brand-purple bg-brand-purple text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    } ${saving ? "cursor-wait opacity-60" : ""}`}
                  >
                    <input
                      aria-label={method.label}
                      type="radio"
                      name="payment-method"
                      value={method.id}
                      checked={selected}
                      onChange={() => choosePaymentMethod(method.id)}
                      disabled={saving}
                      className="sr-only"
                    />
                    {method.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </form>
      {confirmingDiscard ? (
        <ConfirmDialog
          title="Discard these invoice changes?"
          body="The price, add-ons and payment you entered here will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          tone="danger"
          zIndex={1100}
          onConfirm={onClose}
          onClose={() => setConfirmingDiscard(false)}
        />
      ) : null}
    </ModalShell>
  );
}
