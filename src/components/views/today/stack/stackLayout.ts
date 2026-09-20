/** Shared geometry: warnings use a reserved 44px row in the exposed strip. */
export const STACK_HEADER_HEIGHT = 144;
export const STACK_STRIP_HEIGHT = 96;
const GAP = 12;

export function stackLayout({
  count, selectedIndex, detailHeight = 0, availableHeight = 0, pullProgress = 0,
}: {
  count: number;
  selectedIndex: number;
  detailHeight?: number;
  availableHeight?: number;
  pullProgress?: number;
}) {
  if (count === 0) return { positions: [], height: 0 };
  const selected = Math.max(0, Math.min(count - 1, selectedIndex));
  const futureCount = count - selected - 1;
  const step = STACK_STRIP_HEIGHT
    + (STACK_HEADER_HEIGHT + GAP - STACK_STRIP_HEIGHT) * Math.min(1, Math.max(0, pullProgress));
  const focusEnd = selected * (STACK_HEADER_HEIGHT + GAP) + STACK_HEADER_HEIGHT + detailHeight;
  const futureHeight = futureCount ? STACK_HEADER_HEIGHT + (futureCount - 1) * step : 0;
  // Bottom-align when room permits. Long days retain readable strips and scroll.
  const restingFutureHeight = futureCount ? STACK_HEADER_HEIGHT + (futureCount - 1) * STACK_STRIP_HEIGHT : 0;
  const futureStart = Math.max(focusEnd + GAP, availableHeight - restingFutureHeight);
  const positions = Array.from({ length: count }, (_, index) => index <= selected
    ? index * (STACK_HEADER_HEIGHT + GAP)
    : futureStart + (index - selected - 1) * step);
  return { positions, height: futureCount ? futureStart + futureHeight : focusEnd };
}
