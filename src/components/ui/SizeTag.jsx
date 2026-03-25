export function SizeTag({ size, legendMode, headerMode }) {
  const config = {
    small: { colour: "#F5C518", dotSize: headerMode ? 24 : (legendMode ? 12 : 14) },
    medium: { colour: "#2D8B7A", dotSize: headerMode ? 30 : (legendMode ? 18 : 20) },
    large: { colour: "#E8567F", dotSize: headerMode ? 36 : (legendMode ? 24 : 26) },
  };
  const c = config[size];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: c.dotSize, height: c.dotSize, borderRadius: "50%",
      background: c.colour, flexShrink: 0,
    }} />
  );
}
