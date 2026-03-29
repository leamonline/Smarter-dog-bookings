import { BRAND } from "../../../constants/index.js";

export function ExitConfirmDialog({ onDiscard, onKeepEditing }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        style={{
          background: BRAND.white,
          borderRadius: 16,
          padding: 24,
          width: 300,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 8,
            color: BRAND.text,
          }}
        >
          Discard changes?
        </div>
        <div
          style={{
            fontSize: 13,
            color: BRAND.textLight,
            marginBottom: 20,
          }}
        >
          You have unsaved changes. Are you sure you want to close?
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onDiscard}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: BRAND.coral,
              color: BRAND.white,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Discard
          </button>
          <button
            onClick={onKeepEditing}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: `1.5px solid ${BRAND.greyLight}`,
              background: BRAND.white,
              color: BRAND.text,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
