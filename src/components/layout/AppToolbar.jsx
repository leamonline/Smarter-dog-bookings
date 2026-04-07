import { useState, useRef, useEffect } from "react";
import { BRAND } from "../../constants/index.js";

// ── Nav items (main bar) ─────────────────────────────────────────
const NAV_ITEMS = [
  { key: "dashboard", label: "Bookings" },
  { key: "dogs", label: "Dogs" },
  { key: "humans", label: "Humans" },
  { key: "stats", label: "Stats" },
];

// ── Menu items (hamburger dropdown) ──────────────────────────────
const MENU_ITEMS = [
  { key: "reports", label: "Reports", icon: "\uD83D\uDCCA" },
  { key: "settings", label: "Settings", icon: "\u2699\uFE0F" },
];

// ── Styles ───────────────────────────────────────────────────────

const navGroupStyle = {
  display: "flex",
  gap: 2,
  background: "#F1F3F5",
  padding: 4,
  borderRadius: 10,
  flexShrink: 1,
  minWidth: 0,
};

const navBtnBase = {
  borderRadius: 7,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s",
  border: "none",
  background: "transparent",
  color: BRAND.grey,
  whiteSpace: "nowrap",
};

const navBtnActive = {
  ...navBtnBase,
  background: BRAND.white,
  color: BRAND.blueDark,
  fontWeight: 700,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

export function AppToolbar({
  activeView,
  setActiveView,
  onSignOut,
  isOnline,
  user,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isMenuViewActive = activeView === "reports" || activeView === "settings";

  return (
    <>
      <div style={{
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        {/* Left: Logo + Nav group */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1, minWidth: 0 }}>
          <div
            style={{ cursor: "pointer", flexShrink: 0 }}
            onClick={() => setActiveView("dashboard")}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.text }}>
              Smarter<span style={{ color: BRAND.blue }}>Dog</span>
            </div>
          </div>

          <div style={navGroupStyle}>
            {NAV_ITEMS.map((item) => {
              const isActive = activeView === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveView(item.key)}
                  style={isActive ? navBtnActive : navBtnBase}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = BRAND.text;
                      e.currentTarget.style.background = "rgba(255,255,255,0.6)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = BRAND.grey;
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Hamburger menu */}
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1.5px solid ${menuOpen || isMenuViewActive ? BRAND.blueDark : BRAND.greyLight}`,
              background: menuOpen || isMenuViewActive ? BRAND.blueLight : BRAND.white,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all 0.15s", fontSize: 18,
              color: menuOpen || isMenuViewActive ? BRAND.blueDark : BRAND.grey,
            }}
            onMouseEnter={(e) => {
              if (!menuOpen && !isMenuViewActive) {
                e.currentTarget.style.borderColor = BRAND.blueDark;
                e.currentTarget.style.color = BRAND.blueDark;
              }
            }}
            onMouseLeave={(e) => {
              if (!menuOpen && !isMenuViewActive) {
                e.currentTarget.style.borderColor = BRAND.greyLight;
                e.currentTarget.style.color = BRAND.grey;
              }
            }}
          >
            {"\u2630"}
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div style={{
              position: "absolute", top: 42, right: 0, zIndex: 100,
              background: BRAND.white, border: `1px solid ${BRAND.greyLight}`,
              borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
              minWidth: 180, overflow: "hidden",
              animation: "fadeIn 0.12s ease-out",
            }}>
              {MENU_ITEMS.map((item) => {
                const isActive = activeView === item.key;
                return (
                  <button key={item.key} onClick={() => { setActiveView(item.key); setMenuOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "12px 16px", border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 14, fontWeight: isActive ? 700 : 600,
                      color: isActive ? BRAND.blueDark : BRAND.text,
                      background: isActive ? BRAND.blueLight : "transparent",
                      transition: "background 0.1s", textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#F8FAFB"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}

              {isOnline && user && (
                <>
                  <div style={{ height: 1, background: BRAND.greyLight, margin: "0 12px" }} />
                  <button onClick={() => { onSignOut(); setMenuOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "12px 16px", border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 14, fontWeight: 600,
                      color: BRAND.coral, background: "transparent",
                      transition: "background 0.1s", textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coralLight; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 16 }}>{"\uD83D\uDEAA"}</span>
                    Log out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

    </>
  );
}
