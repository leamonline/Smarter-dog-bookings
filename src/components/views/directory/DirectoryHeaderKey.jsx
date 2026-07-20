import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { SizeDot } from "../../ui/SizeDot.jsx";

const SIZES = [
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
  [null, "Unknown"],
];

export function DirectoryHeaderKey() {
  return (
    <details className="group static shrink-0 sm:relative">
      <summary
        aria-label="Open directory key"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-slate-300 bg-white text-brand-purple shadow-sm transition-colors hover:border-brand-purple/40 hover:bg-brand-purple/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
      >
        <Info aria-hidden="true" size={19} strokeWidth={2.4} />
      </summary>

      <div className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-40 w-auto rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl sm:left-auto sm:right-0 sm:w-[min(22rem,calc(100vw-2rem))]">
        <h2 className="text-sm font-extrabold text-brand-purple">Directory key</h2>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
          Colours and symbols help you scan profiles quickly.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-slate-700">
          {SIZES.map(([size, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <SizeDot size={size} dim={12} />
              {label}
            </span>
          ))}
        </div>

        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-600">
          <li className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" size={15} className="shrink-0 text-brand-coral" />
            Safety or care information needs attention
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-flex h-5 items-center rounded-full bg-brand-yellow/40 px-2 text-[9px] font-extrabold uppercase text-brand-purple">Missing</span>
            Core profile information needs completing
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight aria-hidden="true" size={15} className="shrink-0 text-brand-purple" />
            Open the full profile
          </li>
        </ul>
      </div>
    </details>
  );
}
