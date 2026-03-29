import { BRAND } from "../../constants/index.js";

export function AppToolbar({
  activeView,
  setActiveView,
  onNewBooking,
  onSignOut,
  isOnline,
  user,
}) {
  return (
    <div
      style={{
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div
        style={{ cursor: "pointer" }}
        onClick={() => setActiveView("dashboard")}
      >
        <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.text }}>
          Smarter<span style={{ color: BRAND.blue }}>Dog</span>
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 2 }}>
          Salon Dashboard
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onNewBooking}
          style={{
            background: BRAND.blue,
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: BRAND.white,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = BRAND.blueDark;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = BRAND.blue;
          }}
        >
          + New Booking
        </button>

        <button
          onClick={() => setActiveView("dogs")}
          style={{
            background: activeView === "dogs" ? BRAND.blueLight : BRAND.white,
            border: `1px solid ${activeView === "dogs" ? BRAND.blue : BRAND.greyLight}`,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            color: activeView === "dogs" ? BRAND.blueDark : BRAND.text,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (activeView !== "dogs") {
              e.currentTarget.style.borderColor = BRAND.blue;
              e.currentTarget.style.color = BRAND.blue;
            }
          }}
          onMouseLeave={(e) => {
            if (activeView !== "dogs") {
              e.currentTarget.style.borderColor = BRAND.greyLight;
              e.currentTarget.style.color = BRAND.text;
            }
          }}
        >
          Dogs
        </button>

        <button
          onClick={() => setActiveView("humans")}
          style={{
            background:
              activeView === "humans" ? BRAND.tealLight : BRAND.white,
            border: `1px solid ${activeView === "humans" ? BRAND.teal : BRAND.greyLight}`,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            color: activeView === "humans" ? "#1F6659" : BRAND.text,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (activeView !== "humans") {
              e.currentTarget.style.borderColor = BRAND.teal;
              e.currentTarget.style.color = BRAND.teal;
            }
          }}
          onMouseLeave={(e) => {
            if (activeView !== "humans") {
              e.currentTarget.style.borderColor = BRAND.greyLight;
              e.currentTarget.style.color = BRAND.text;
            }
          }}
        >
          Humans
        </button>

        <button
          onClick={() => setActiveView("settings")}
          style={{
            background:
              activeView === "settings" ? BRAND.blueLight : BRAND.white,
            border: `1px solid ${activeView === "settings" ? BRAND.blue : BRAND.greyLight}`,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            color: activeView === "settings" ? BRAND.blueDark : BRAND.text,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (activeView !== "settings") {
              e.currentTarget.style.borderColor = BRAND.blue;
              e.currentTarget.style.color = BRAND.blue;
            }
          }}
          onMouseLeave={(e) => {
            if (activeView !== "settings") {
              e.currentTarget.style.borderColor = BRAND.greyLight;
              e.currentTarget.style.color = BRAND.text;
            }
          }}
        >
          Settings
        </button>

        {isOnline && user && (
          <button
            onClick={onSignOut}
            style={{
              background: BRAND.coralLight,
              border: "none",
              borderRadius: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: BRAND.coral,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = BRAND.coral;
              e.currentTarget.style.color = BRAND.white;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = BRAND.coralLight;
              e.currentTarget.style.color = BRAND.coral;
            }}
          >
            Log out
          </button>
        )}
      </div>
    </div>
  );
}
