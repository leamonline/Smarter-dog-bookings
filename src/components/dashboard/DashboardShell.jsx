/**
 * Three-column dashboard shell.
 *
 * From `lg` up the grid fills the height the app shell hands it and each
 * column scrolls its own overflow, so all three end level at the bottom of
 * the window. Below `lg` it is a single column with no height constraint at
 * all, and the page scrolls normally.
 *
 * Where the height comes from, and why it changed.
 *
 * This used to measure the LEFT column with a ResizeObserver and cap the
 * other two to whatever it found, so the three ended level at the bottom of
 * the *sidebar*. That is why the schedule stopped part-way down the window:
 * the rail's natural content — mini-calendar, capacity, revenue — is simply
 * shorter than a desktop window, and the day's bookings were being trimmed to
 * match it. Everything below was dead space.
 *
 * Now nothing is measured. AppFrame is a fixed-height flex column, so the
 * browser has already worked out what is left after the chrome; `h-full`
 * inherits it and `min-h-0` lets the columns shrink inside it rather than
 * pushing the grid taller than its parent. The left rail is a scroller like
 * the other two instead of being the thing that defines the height — on a
 * short window it now scrolls rather than dictating that everyone else be
 * short too.
 *
 * The sticky positioning went with it. `lg:sticky lg:top-4` existed because
 * the document scrolled underneath these columns; nothing scrolls underneath
 * them any more, so they simply sit in a full-height grid.
 *
 * The guarantee from #834 is kept, and is the reason every height utility
 * here is `lg:`-scoped: below that breakpoint the left column is
 * `display:none` and reports a height of 0, so any constraint derived from it
 * outlived the layout that produced it and clipped the booking grid on
 * phones. There is no longer a measurement to go stale, and no max-height at
 * any width — `maxHeight` computes to `none` below `lg`, which
 * e2e/viewport-continuity.spec.ts pins.
 */

// Each column: fill the row, allow shrinking, carry its own overflow.
const COLUMN_FILL = "lg:h-full lg:min-h-0";

export function DashboardShell({ left, main, right }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_300px] gap-4 lg:gap-6 relative lg:h-full lg:min-h-0">
      {/* Left sidebar — a scroller in its own right now, not the column the
          other two are measured against. */}
      {left && (
        <div className={`hidden lg:block lg:order-1 ${COLUMN_FILL} lg:overflow-y-auto`}>
          {left}
        </div>
      )}

      {/* Middle column — the day's schedule. It gets the full height of the
          shell and scrolls internally, so the grid runs to the bottom of the
          window instead of stopping where the sidebar happened to end. */}
      <div className={`order-1 lg:order-2 min-w-0 ${COLUMN_FILL} lg:overflow-hidden lg:flex lg:flex-col`}>
        {main}
      </div>

      {/* Right column — same contract. Long workflow stacks (waitlist, to-do,
          booking history) scroll internally. Bottom corners rounded so
          scrolled content fades into a rounded edge instead of a hard clip —
          matches the booking grid card in the middle column. */}
      {right && (
        <div className={`order-2 lg:order-3 hidden xl:block ${COLUMN_FILL} lg:overflow-y-auto lg:rounded-b-2xl`}>
          {right}
        </div>
      )}
    </div>
  );
}
