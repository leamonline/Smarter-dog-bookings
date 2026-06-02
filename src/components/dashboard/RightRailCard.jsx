// ============================================================
// src/components/dashboard/RightRailCard.jsx
//
// Shared primitive for the four right-rail cards. Resolves a
// (tone, accent) pair into a class bundle; renders the heading,
// optional pill, big numeral OR muted line, subtitle, optional
// progress bar, optional `aiBlock` and `loudChildren` slots, plus
// a CTA. Each card wrapper (`WhatsAppInboxCard`, etc.) computes its
// own tone via the resolvers in ./tone/ and feeds the result here.
//
// Visual rules:
//   - Calm: per-card hue tinted very lightly; muted heading + icon;
//     no big numeral (just `primaryLine`); CTA demoted to a tertiary
//     text link. Card shrinks to natural height.
//   - Active: per-card hue intensifies — gradient background, full-
//     colour heading + icon, big numeral, outlined CTA.
//   - Attention: same interior as active PLUS a coral attention frame
//     (border + shadow + pill + filled CTA). Rose-accent cards swap
//     coral for red-700 to avoid the rose-coral colour clash.
//
// Tailwind 4 detects classes by literal source occurrence, so every
// (tone, accent) variant lives explicitly in THEME below.
// ============================================================

import { ArrowRight } from "lucide-react";
import { SkeletonBlock } from "../ui/Skeleton.jsx";

const THEME = {
  emerald: {
    calm: {
      frame:
        "rounded-2xl border border-transparent bg-emerald-50/30 p-3",
      heading: "text-emerald-700/50",
      iconWrap: "bg-neutral-100 text-neutral-400",
      primary: "text-emerald-700/70 text-sm font-medium",
      cta: "text-emerald-700 hover:underline text-[12px] font-semibold",
    },
    active: {
      frame:
        "rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-[0_2px_8px_rgba(34,197,94,0.08)]",
      heading: "text-emerald-700",
      iconWrap: "bg-emerald-100 text-emerald-700",
      primaryNumber: "text-emerald-700",
      subtitle: "text-emerald-700/70",
      pill: "bg-emerald-100 text-emerald-800",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-emerald-100",
      progressFill: "bg-emerald-600",
    },
    attention: {
      frame:
        "rounded-2xl border-2 border-brand-coral bg-gradient-to-br from-emerald-50 to-white p-4 shadow-[0_2px_12px_rgba(231,84,108,0.18)]",
      heading: "text-emerald-700",
      iconWrap: "bg-emerald-100 text-emerald-700",
      iconDot: "bg-brand-coral",
      primaryNumber: "text-emerald-700",
      subtitle: "text-emerald-700/70",
      pill: "bg-brand-coral text-white",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full bg-brand-coral text-white hover:bg-brand-coral-dark px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-emerald-100",
      progressFill: "bg-brand-coral",
    },
  },
  amber: {
    calm: {
      frame: "rounded-2xl border border-transparent bg-amber-50/30 p-3",
      heading: "text-amber-700/50",
      iconWrap: "bg-neutral-100 text-neutral-400",
      primary: "text-amber-800/70 text-sm font-medium",
      cta: "text-amber-700 hover:underline text-[12px] font-semibold",
    },
    active: {
      frame:
        "rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-[0_2px_8px_rgba(245,158,11,0.08)]",
      heading: "text-amber-700",
      iconWrap: "bg-amber-100 text-amber-700",
      primaryNumber: "text-amber-700",
      subtitle: "text-amber-800/70",
      pill: "bg-amber-100 text-amber-800",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full border border-amber-600 text-amber-700 hover:bg-amber-50 px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-amber-100",
      progressFill: "bg-amber-600",
    },
    attention: {
      frame:
        "rounded-2xl border-2 border-brand-coral bg-gradient-to-br from-amber-50 to-white p-4 shadow-[0_2px_12px_rgba(231,84,108,0.18)]",
      heading: "text-amber-700",
      iconWrap: "bg-amber-100 text-amber-700",
      iconDot: "bg-brand-coral",
      primaryNumber: "text-amber-700",
      subtitle: "text-amber-800/70",
      pill: "bg-brand-coral text-white",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full bg-brand-coral text-white hover:bg-brand-coral-dark px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-amber-100",
      progressFill: "bg-brand-coral",
    },
  },
  sky: {
    calm: {
      frame: "rounded-2xl border border-transparent bg-sky-50/30 p-3",
      heading: "text-sky-700/50",
      iconWrap: "bg-neutral-100 text-neutral-400",
      primary: "text-sky-700/70 text-sm font-medium",
      cta: "text-sky-700 hover:underline text-[12px] font-semibold",
    },
    active: {
      frame:
        "rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-[0_2px_8px_rgba(14,165,233,0.08)]",
      heading: "text-sky-700",
      iconWrap: "bg-sky-100 text-sky-700",
      primaryNumber: "text-sky-700",
      subtitle: "text-sky-700/70",
      pill: "bg-sky-100 text-sky-800",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full border border-sky-600 text-sky-700 hover:bg-sky-50 px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-sky-100",
      progressFill: "bg-sky-600",
    },
    attention: {
      frame:
        "rounded-2xl border-2 border-brand-coral bg-gradient-to-br from-sky-50 to-white p-4 shadow-[0_2px_12px_rgba(231,84,108,0.18)]",
      heading: "text-sky-700",
      iconWrap: "bg-sky-100 text-sky-700",
      iconDot: "bg-brand-coral",
      primaryNumber: "text-sky-700",
      subtitle: "text-sky-700/70",
      pill: "bg-brand-coral text-white",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full bg-brand-coral text-white hover:bg-brand-coral-dark px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-sky-100",
      progressFill: "bg-brand-coral",
    },
  },
  rose: {
    calm: {
      frame: "rounded-2xl border border-transparent bg-rose-50/30 p-3",
      heading: "text-rose-700/50",
      iconWrap: "bg-neutral-100 text-neutral-400",
      primary: "text-rose-700/70 text-sm font-medium",
      cta: "text-rose-700 hover:underline text-[12px] font-semibold",
    },
    active: {
      frame:
        "rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-[0_2px_8px_rgba(244,63,94,0.08)]",
      heading: "text-rose-700",
      iconWrap: "bg-rose-100 text-rose-700",
      primaryNumber: "text-rose-700",
      subtitle: "text-rose-700/70",
      pill: "bg-rose-100 text-rose-800",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full border border-rose-600 text-rose-700 hover:bg-rose-50 px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-rose-100",
      progressFill: "bg-rose-600",
    },
    // Rose accent uses red-700 instead of coral on attention — the rose
    // body + coral overlay clash visually. red-700 still reads as
    // "warning" and contrasts cleanly with the rose interior.
    attention: {
      frame:
        "rounded-2xl border-2 border-red-700 bg-gradient-to-br from-rose-50 to-white p-4 shadow-[0_2px_12px_rgba(185,28,28,0.22)]",
      heading: "text-rose-700",
      iconWrap: "bg-rose-100 text-rose-700",
      iconDot: "bg-red-700",
      primaryNumber: "text-rose-700",
      subtitle: "text-rose-700/70",
      pill: "bg-red-700 text-white",
      cta:
        "inline-flex items-center justify-center gap-2 rounded-full bg-red-700 text-white hover:bg-red-800 px-4 py-2 text-[13px] font-bold",
      progressTrack: "bg-rose-100",
      progressFill: "bg-red-700",
    },
  },
};

const BARE_FRAME = {
  calm: "p-3 bg-transparent",
  active: "p-3 bg-transparent",
  attention: "p-3 bg-transparent",
};

export function RightRailCard({
  tone,
  accent,
  heading,
  icon: Icon,
  pillLabel,
  primaryNumber,
  primaryLine,
  subtitle,
  progress,
  aiBlock,
  loudChildren,
  cta,
  ariaLabel,
  loading = false,
  bare = false,
}) {
  const theme = THEME[accent]?.[tone] ?? THEME.emerald.active;
  const isCalm = tone === "calm";
  const frame = bare ? BARE_FRAME[tone] : theme.frame;

  return (
    <section
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={[
        "block w-full font-[inherit] overflow-hidden",
        frame,
        "motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-200",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2
            className={`text-label truncate ${theme.heading}`}
          >
            {heading}
          </h2>
          {!isCalm && pillLabel && (
            <span
              className={`text-label rounded-full px-2 py-0.5 ${theme.pill}`}
            >
              {pillLabel}
            </span>
          )}
        </div>
        <span
          className={`relative w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${theme.iconWrap}`}
        >
          <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
          {tone === "attention" && theme.iconDot && (
            <span
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${theme.iconDot}`}
              aria-hidden="true"
            />
          )}
        </span>
      </div>

      {/* Primary body — big numeral OR muted line, depending on tone */}
      <div className="mb-2">
        {loading ? (
          <SkeletonBlock className="h-8 w-24 rounded-md" />
        ) : isCalm ? (
          <div className={theme.primary}>{primaryLine}</div>
        ) : (
          <div className="flex items-baseline gap-2">
            {primaryNumber !== null && primaryNumber !== undefined && (
              <div
                className={`text-3xl font-black font-display leading-none ${theme.primaryNumber}`}
              >
                {primaryNumber}
              </div>
            )}
            {subtitle && (
              <div className={`text-[11px] font-semibold ${theme.subtitle}`}>
                {subtitle}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress bar — reminders' loud states only */}
      {!isCalm && progress && (
        <div
          className={`h-1.5 w-full rounded-full overflow-hidden mb-3 ${theme.progressTrack}`}
          role="progressbar"
          aria-valuenow={progress.current}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        >
          <div
            className={`h-full ${theme.progressFill} motion-safe:transition-[width] motion-safe:duration-300`}
            style={{ width: `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%` }}
          />
        </div>
      )}

      {/* AI summary slot — only inbox uses this */}
      {!isCalm && aiBlock && <div className="mb-3">{aiBlock}</div>}

      {/* Loud children — reminders' tick list */}
      {!isCalm && loudChildren && <div className="mb-3">{loudChildren}</div>}

      {/* CTA — tertiary link-styled button when calm, full button when loud */}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className={
            isCalm
              ? `inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer font-[inherit] ${theme.cta}`
              : `w-full cursor-pointer font-[inherit] ${theme.cta}`
          }
        >
          {cta.label}
          <ArrowRight size={isCalm ? 12 : 14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
