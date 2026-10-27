import { X } from "lucide-react";
import { Button } from "./Button.jsx";
import { IconButton } from "./IconButton.jsx";

// Visible error feedback used at page and card level. Defaults match
// the original global-banner styling; pass `title`, `retry`, or
// `retryLabel` to customise. Use <InlineError /> for one-line,
// in-form error messages instead.
//
// Tone guide: keep messages warm and empathetic — avoid cold tech-speak,
// and use UK English throughout ("colour", "apologise", "Cancelled") to
// match the salon's customer-facing voice.
export function ErrorBanner({
  message,
  title = "Couldn't complete this action",
  onClose,
  retry,
  retryLabel = "Try again",
}) {
  return (
    <div
      role="alert"
      className="bg-red-100 border border-brand-red rounded-tile py-4 px-4 my-4 flex flex-wrap items-start gap-2.5"
    >
      <span className="text-xl" aria-hidden="true">{"\u26A0\uFE0F"}</span>
      <div className="flex-1 min-w-0 basis-40">
        <div className="text-sm font-bold text-red-800">{title}</div>
        {message && <div className="text-body text-slate-800 mt-1">{message}</div>}
      </div>
      {(retry || onClose) && (
        <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
          {retry && (
            <Button variant="ghost" size="sm" onClick={retry}
              className="min-h-11 whitespace-normal text-left">
              {retryLabel}
            </Button>
          )}
          {onClose && (
            <IconButton label="Dismiss error" onClick={onClose} className="min-h-11 min-w-11">
              <X size={16} aria-hidden="true" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
