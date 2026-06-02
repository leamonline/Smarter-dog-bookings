// src/components/ui/Spinner.jsx
//
// Inline loading spinner for buttons, "load more", and small async slots.
// Uses currentColor so it adapts to the surrounding text colour (purple on a
// primary button, slate on a ghost button, etc.). The full-page centred
// version lives in LoadingSpinner.jsx (used by route Suspense fallbacks) —
// keep both.

const SIZES = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-10 h-10 border-4",
};

export function Spinner({ size = "md", label = "Loading", className = "" }) {
  return (
    <span role="status" className={`inline-flex ${className}`}>
      <span
        className={`${SIZES[size] || SIZES.md} rounded-full border-current/30 border-t-current animate-spin`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
