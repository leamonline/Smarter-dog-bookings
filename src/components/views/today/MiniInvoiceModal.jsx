import { useEffect, useState } from "react";
import {
  AVAILABLE_ADDONS,
  PAYMENT_METHODS,
  SERVICES,
  getAddonsTotal,
} from "../../../constants/salon";
import { computeBookingPricing } from "../../../engine/bookingRules";
import { buildMiniInvoicePatch } from "../../../engine/dailyBrief";
import { ModalShell } from "../../modals/shell/ModalShell.jsx";
import { formatMoney } from "./parts.jsx";

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-[inherit] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";

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

  const requestDirtyClose = () => {
    if (window.confirm("Discard these invoice changes?")) onClose();
  };

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
      widthClass="w-[min(520px,95vw)]"
      bodyClassName="p-4 sm:p-5"
      mobilePresentation="sheet"
      header={
        <header className="px-5 pb-4 pt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Mini invoice
          </p>
          <h2
            id="mini-invoice-title"
            className="font-display text-2xl font-bold text-brand-purple"
          >
            Invoice · {dogName}
          </h2>
        </header>
      }
      footer={
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-white px-5 py-3">
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
      }
    >
      <form id="mini-invoice-form" onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          {serviceName} · {booking.slot}
        </p>

        <label className="flex flex-col gap-1.5 text-sm font-bold text-slate-800">
          Base groom price
          <input
            aria-label="Base groom price"
            type="number"
            min="0.01"
            step="0.01"
            value={basePrice}
            onChange={updateBasePrice}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-slate-800">Additional services</legend>
          {AVAILABLE_ADDONS.map((addon) => (
            <label
              key={addon}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
            >
              <input
                type="checkbox"
                checked={addons.includes(addon)}
                onChange={() => toggleAddon(addon)}
                disabled={saving}
                className="h-5 w-5 accent-brand-purple"
              />
              {addon}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-bold text-slate-800">
          Deposit received
          <input
            aria-label="Deposit received"
            type="number"
            min="0"
            step="0.01"
            value={depositAmount}
            onChange={updateDepositAmount}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </label>

        <dl className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="font-semibold text-slate-600">Total</dt>
            <dd className="font-bold tabular-nums text-slate-900">{formatMoney(totals.subtotal)}</dd>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-100 pt-2">
            <dt className="font-semibold text-slate-600">Outstanding balance</dt>
            <dd className="font-bold tabular-nums text-slate-900">{formatMoney(totals.amountDue)}</dd>
          </div>
        </dl>

        <label className="flex flex-col gap-1.5 text-sm font-bold text-slate-800">
          Payment received
          <input
            aria-label="Payment received"
            type="number"
            min="0"
            step="0.01"
            value={paymentReceived}
            onChange={updatePaymentReceived}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-800">Payment method</legend>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((method) => (
              <label
                key={method.id}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-700"
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={method.id}
                  checked={paymentMethod === method.id}
                  onChange={() => choosePaymentMethod(method.id)}
                  disabled={saving}
                  className="h-4 w-4 accent-brand-purple"
                />
                {method.label}
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm font-semibold text-brand-coral-text">
            {error}
          </p>
        ) : null}
      </form>
    </ModalShell>
  );
}
