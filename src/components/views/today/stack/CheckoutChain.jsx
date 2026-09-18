// Handing a dog back, as one gesture.
//
//     Check out  →  Cash £32 | Card £32  →  Collected · £32 cash
//     Check out  →  Collected                       (nothing owed)
//
// Each step replaces the last in the same place on the card, so the button
// under the thumb does not move between presses and the sequence reads as one
// action rather than three decisions. Only the last press writes.
//
// The steps live in engine/dayStack.ts; this renders them and remembers where
// the chain has got to. "Back" steps one place rather than abandoning the
// chain, because the mistake it exists to fix is usually "wrong method", not
// "wrong dog".
import { useState, useCallback } from "react";
import { checkoutChain, nextCheckoutStep } from "../../../../engine/dayStack";

const BASE =
  "flex min-h-11 items-center justify-center rounded-md px-4 text-[15px] font-medium " +
  "outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

const KIND_CLASS = {
  primary: "flex-auto border-[1.5px]",
  default: "flex-auto border-[1.5px]",
  quiet: "flex-none border border-dashed text-[13.5px]",
};

function styleFor(kind, tone) {
  if (kind === "primary") {
    return { backgroundColor: tone.ink, color: tone.tint, borderColor: tone.ink, outlineColor: tone.ink };
  }
  if (kind === "quiet") {
    return { color: tone.meta, borderColor: "rgba(0,0,0,0.18)", outlineColor: tone.ink };
  }
  return {
    backgroundColor: "rgba(0,0,0,0.05)",
    color: tone.ink,
    borderColor: "rgba(0,0,0,0.18)",
    outlineColor: tone.ink,
  };
}

export function CheckoutChain({ amountDue, tone, dogName, busy = false, onCollect, onStepChange }) {
  const [step, setStep] = useState(null);
  const [method, setMethod] = useState(null);

  const press = useCallback((button) => {
    const target = nextCheckoutStep(button.id, { step, amountDue });
    if (button.method) setMethod(button.method);

    if (target === "done") {
      onCollect({ method, amountDue: amountDue ?? 0 });
      return;
    }
    if (target === null) setMethod(null);
    setStep(target);
    onStepChange?.(target);
  }, [amountDue, method, onCollect, onStepChange, step]);

  const buttons = checkoutChain({ step, amountDue, method });

  return (
    <div data-checkout-chain data-checkout-step={step ?? "idle"} className="mt-3.5 flex flex-wrap gap-2">
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          aria-label={`${button.label} — ${dogName}`}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={(e) => {
            e.stopPropagation();
            press(button);
          }}
          className={`${BASE} ${KIND_CLASS[button.kind]}`}
          style={styleFor(button.kind, tone)}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
