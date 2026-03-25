export function StaffIconBtn({ icon, title, onClick }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "none", border: "none", width: 26, height: 26, display: "flex",
      alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
      transition: "all 0.15s", borderRadius: 4,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.transform = "scale(1.12)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1)"; }}>
      {icon}
    </button>
  );
}
