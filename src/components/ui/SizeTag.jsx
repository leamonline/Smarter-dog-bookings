import { SIZE_THEME } from "../../constants/index.js";

const DOT_SIZES = {
  small:  { normal: 14, legend: 12, header: 24 },
  medium: { normal: 20, legend: 18, header: 30 },
  large:  { normal: 26, legend: 24, header: 36 },
};

export function SizeTag({ size, legendMode, headerMode }) {
  const theme = SIZE_THEME[size];
  const dots = DOT_SIZES[size];
  if (!theme || !dots) return null;
  const dotSize = headerMode ? dots.header : legendMode ? dots.legend : dots.normal;

  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: dotSize, height: dotSize, background: theme.gradient[0] }}
    />
  );
}
