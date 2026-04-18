export function AppFrame({ children, className = "" }) {
  const classes = ["max-w-7xl mx-auto px-4 sm:px-6 py-5 font-sans", className]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

export function CenteredScreen({
  children,
  className = "",
  fontClassName = "font-sans",
}) {
  const classes = [
    "min-h-screen bg-brand-paper flex items-center justify-center p-5",
    fontClassName,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

export function PortalCard({ children, className = "" }) {
  const classes = [
    "w-full max-w-[400px] bg-white p-7 border border-slate-200",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
